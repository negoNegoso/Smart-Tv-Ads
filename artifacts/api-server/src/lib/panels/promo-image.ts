/**
 * Baixa a foto de uma promoção e devolve como `data:` URI, pronta para o
 * satori consumir sem sair para a rede.
 *
 * `templates.ts` repassa `item.imageUrl` direto para o satori, que busca a
 * URL sem timeout e sem limite de tamanho — uma imagem lenta ou enorme
 * trava a publicação inteira. Este módulo é o guarda que fica entre o dado
 * cadastrado pelo lojista e o renderizador: baixa com prazo (5s) e teto de
 * tamanho (5MB), e some com a foto silenciosamente se algo der errado —
 * promoção sem foto ainda vende mais que uma TV apagada.
 */

const FETCH_TIMEOUT_MS = 5000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Busca `url` e devolve um `data:` URI com o conteúdo, ou `null` se a URL
 * for vazia, o fetch falhar, estourar o prazo, exceder o teto de tamanho,
 * ou a resposta não for 2xx. Nunca lança.
 */
export async function fetchImageDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;

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
    const mimeType = res.headers.get("content-type") ?? "application/octet-stream";
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  } catch {
    // Timeout (AbortError), falha de rede, DNS, TLS: tudo vira "sem foto".
    return null;
  } finally {
    clearTimeout(timer);
  }
}
