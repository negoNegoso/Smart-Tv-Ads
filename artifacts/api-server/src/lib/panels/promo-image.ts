import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";
import { sniffImageMimeType } from "../image-sniff";
import type { MediaStore } from "../storage/types";

/**
 * Resolve a foto de uma promoção para um `data:` URI, pronta para o satori
 * consumir sem sair para a rede em tempo de render.
 *
 * `item.imageUrl` é texto livre digitado pelo lojista: pode ser uma URL
 * absoluta em qualquer lugar da internet, ou um caminho relativo já
 * produzido por um upload anterior deste próprio servidor (`/api/uploads/…`,
 * `/api/storage/objects/…`). Os dois caminhos são tratados de formas
 * completamente diferentes:
 *
 * - Caminho relativo → a imagem já está em um dos nossos MediaStore. Lemos
 *   direto de lá (`store.get`), sem tocar rede nenhuma — nenhum risco de
 *   SSRF porque não é uma URL de terceiro.
 * - URL absoluta http(s) → é entrada do lojista, potencialmente hostil.
 *   `fetchExternalImageDataUri` busca com timeout, teto de tamanho, exige
 *   https, recusa hosts que resolvem para IP privado/loopback/link-local
 *   (o que cobre o endpoint de metadados de nuvem, 169.254.169.254) e nunca
 *   segue redirecionamento.
 *
 * Qualquer recusa em qualquer um dos dois caminhos vira `null`, nunca
 * lança: quem chama trata como "sem foto" e a publicação segue.
 */
export async function fetchImageDataUri(
  url: string | null,
  store: Pick<MediaStore, "get">,
): Promise<string | null> {
  if (!url) return null;
  if (!isAbsoluteHttpUrl(url)) {
    const buffer = await store.get(url);
    if (!buffer) return null;
    const mimeType = sniffImageMimeType(buffer);
    if (!mimeType) return null;
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  }
  return fetchExternalImageDataUri(url);
}

const FETCH_TIMEOUT_MS = 5000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function isAbsoluteHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * Busca uma URL absoluta e devolve um `data:` URI com o conteúdo, ou `null`
 * se o esquema não for https, o host não for público, o fetch falhar,
 * estourar o prazo, exceder o teto de tamanho, a resposta redirecionar, não
 * for 2xx, ou o content-type não começar com `image/`. Nunca lança.
 */
async function fetchExternalImageDataUri(url: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // http simples (sem TLS) não entra: o lojista digitou a URL, não temos
  // como garantir que o servidor do outro lado é quem diz ser.
  if (parsed.protocol !== "https:") return null;
  if (!(await isSafeExternalHost(parsed.hostname))) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    // redirect: "manual" faz o fetch do Node devolver o 3xx real em vez de
    // segui-lo — um redirecionamento é só mais um jeito de escapar da
    // checagem de host acima, então tratamos como qualquer outra recusa.
    const res = await fetch(url, { signal: controller.signal, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) return null;
    if (!res.ok) return null;

    const contentType = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
    if (!contentType.toLowerCase().startsWith("image/")) return null;

    const declaredLength = Number(res.headers.get("content-length") ?? "");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) return null;

    const reader = res.body?.getReader();
    if (!reader) return null;

    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      // O content-length pode faltar ou mentir; o teto real é medido no que
      // efetivamente chega.
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }

    const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    // Timeout (AbortError), falha de rede, DNS, TLS: tudo vira "sem foto".
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve o host e recusa qualquer IP privado, loopback ou link-local — o
 * que inclui o endpoint de metadados de nuvem (169.254.169.254), alcançável
 * a partir da função se não barrado aqui. Falha de resolução (DNS fora do
 * ar, host inexistente) também é recusa: na dúvida, não busca.
 */
async function isSafeExternalHost(hostname: string): Promise<boolean> {
  const literal = net.isIP(hostname) !== 0;
  let addresses: string[];
  if (literal) {
    addresses = [hostname];
  } else {
    try {
      const results = await dnsLookup(hostname, { all: true });
      addresses = results.map((r) => r.address);
    } catch {
      return false;
    }
  }
  if (addresses.length === 0) return false;
  return addresses.every((address) => !isPrivateAddress(address));
}

function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  // Formato que não reconhecemos: falha fechada.
  return true;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    n = (n << 8) | value;
  }
  return n >>> 0;
}

function ipv4InRange(ip: string, base: string, prefixBits: number): boolean {
  const n = ipv4ToInt(ip);
  const b = ipv4ToInt(base);
  if (n === null || b === null) return false;
  const mask = prefixBits === 0 ? 0 : (~0 << (32 - prefixBits)) >>> 0;
  return (n & mask) === (b & mask);
}

/** RFC 1918 (privadas), loopback, link-local (inclui metadados de nuvem) e outras faixas reservadas. */
function isPrivateIPv4(ip: string): boolean {
  return (
    ipv4InRange(ip, "0.0.0.0", 8) ||
    ipv4InRange(ip, "10.0.0.0", 8) ||
    ipv4InRange(ip, "100.64.0.0", 10) ||
    ipv4InRange(ip, "127.0.0.0", 8) ||
    ipv4InRange(ip, "169.254.0.0", 16) ||
    ipv4InRange(ip, "172.16.0.0", 12) ||
    ipv4InRange(ip, "192.168.0.0", 16) ||
    ipv4InRange(ip, "192.0.0.0", 24) ||
    ipv4InRange(ip, "198.18.0.0", 15) ||
    ipv4InRange(ip, "224.0.0.0", 4) || // multicast
    ipv4InRange(ip, "240.0.0.0", 4) // reservado
  );
}

/** Loopback, link-local (fe80::/10) e unique-local (fc00::/7), inclusive IPv4 mapeado. */
function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true; // fe80::/10
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true; // fc00::/7
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]!);
  return false;
}

