/** Endereço de um CEP, no formato único que o resto do sistema usa. */
export interface CepResult {
  cep: string;
  street: string | null;
  district: string | null;
  city: string;
  state: string;
  cityIbge: string | null;
  // Centro do CEP, não o número exato. Nulos quando a API não informa.
  lat: number | null;
  lng: number | null;
}

export class CepInvalidError extends Error {}
export class CepNotFoundError extends Error {}
export class CepUnavailableError extends Error {}

const TIMEOUT_MS = 5000;
const AWESOME_URL = "https://cep.awesomeapi.com.br/json/";
const BRASIL_URL = "https://brasilapi.com.br/api/cep/v2/";

export function normalizeCep(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 8) throw new CepInvalidError("CEP deve ter 8 dígitos.");
  return digits;
}

type Attempt = { kind: "ok"; result: CepResult } | { kind: "not_found" } | { kind: "unavailable" };

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function coordinate(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function getJson(url: string): Promise<{ status: number; body: Record<string, any> | null } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = res.ok ? ((await res.json()) as Record<string, any>) : null;
    return { status: res.status, body };
  } catch {
    // Rede, DNS, timeout: para quem chama é tudo "serviço fora".
    return null;
  }
}

async function fromAwesome(cep: string): Promise<Attempt> {
  const res = await getJson(AWESOME_URL + cep);
  if (res && (res.status === 404 || res.status === 400)) return { kind: "not_found" };
  const b = res?.body;
  if (!b || !text(b.city) || !text(b.state)) return { kind: "unavailable" };
  return {
    kind: "ok",
    result: {
      cep,
      street: text(b.address),
      district: text(b.district),
      city: text(b.city)!,
      state: text(b.state)!,
      cityIbge: text(b.city_ibge),
      lat: coordinate(b.lat),
      lng: coordinate(b.lng),
    },
  };
}

async function fromBrasil(cep: string): Promise<Attempt> {
  const res = await getJson(BRASIL_URL + cep);
  if (res && res.status === 404) return { kind: "not_found" };
  const b = res?.body;
  if (!b || !text(b.city) || !text(b.state)) return { kind: "unavailable" };
  return {
    kind: "ok",
    result: {
      cep,
      street: text(b.street),
      district: text(b.neighborhood),
      city: text(b.city)!,
      state: text(b.state)!,
      cityIbge: text(b.ibge?.city),
      lat: coordinate(b.location?.coordinates?.latitude),
      lng: coordinate(b.location?.coordinates?.longitude),
    },
  };
}

/**
 * AwesomeAPI primeiro (traz coordenada quase sempre); BrasilAPI só quando a
 * primeira está fora. "Não existe" na primeira encerra: a reserva não sabe
 * mais que ela sobre CEP inexistente e só atrasaria o formulário.
 */
export async function lookupCep(raw: string): Promise<CepResult> {
  const cep = normalizeCep(raw);
  const first = await fromAwesome(cep);
  if (first.kind === "ok") return first.result;
  if (first.kind === "not_found") throw new CepNotFoundError("CEP não encontrado.");
  const second = await fromBrasil(cep);
  if (second.kind === "ok") return second.result;
  if (second.kind === "not_found") throw new CepNotFoundError("CEP não encontrado.");
  throw new CepUnavailableError("Serviço de CEP indisponível.");
}
