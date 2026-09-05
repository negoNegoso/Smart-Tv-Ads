// artifacts/api-server/src/lib/portal/period.ts
import { BUSINESS_TIME_ZONE } from "../ad-eligibility";

/**
 * O filtro de período do portal é um enum fechado, não um número livre.
 * `?days=3650` seria uma varredura de dez anos na maior tabela do banco,
 * disparada por quem só sabe editar a barra de endereços.
 */
export type PortalDays = 7 | 30 | 90;
export const PORTAL_DAYS: readonly PortalDays[] = [7, 30, 90];
export const DEFAULT_PORTAL_DAYS: PortalDays = 30;

/** Devolve o preset pedido, o padrão quando ausente, e `null` no resto. */
export function parseDays(raw: unknown): PortalDays | null {
  if (raw === undefined || raw === null || raw === "") return DEFAULT_PORTAL_DAYS;
  const value = Number(raw);
  return PORTAL_DAYS.find((d) => d === value) ?? null;
}

/**
 * Data local do negócio em `YYYY-MM-DD`. `en-CA` já formata nessa ordem, então
 * não é preciso remontar a string parte por parte.
 */
export function businessDayKey(instant: Date, timeZone: string = BUSINESS_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * As `days` datas locais que terminam no dia de `instant`, em ordem crescente.
 *
 * A caminhada é feita em UTC ao meio-dia porque só o calendário importa aqui:
 * partindo do meio-dia, somar ou subtrair 24h nunca escorrega para o dia
 * vizinho, mesmo que o fuso mude de offset no meio do período.
 */
export function dayKeysEndingAt(
  instant: Date,
  days: number,
  timeZone: string = BUSINESS_TIME_ZONE,
): string[] {
  const [year, month, day] = businessDayKey(instant, timeZone).split("-").map(Number);
  const cursor = Date.UTC(year, month - 1, day, 12);
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const at = new Date(cursor - i * 86_400_000);
    keys.push(`${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`);
  }
  return keys;
}

/**
 * Offset do fuso do negócio naquele instante, em milissegundos.
 *
 * Formata o instante no fuso e reinterpreta o resultado como se fosse UTC: a
 * diferença entre os dois é exatamente o offset.
 */
function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return asUtc - instant.getTime();
}

/**
 * O instante em que a data local `key` começa.
 *
 * O filtro precisa ser um timestamp cru, e não `(created_at AT TIME ZONE ...)`:
 * a expressão descarta os índices compostos da Task 1 e devolve a varredura
 * sequencial que eles existem para evitar.
 *
 * Duas passadas: a primeira estima o offset, a segunda o corrige caso a
 * estimativa tenha caído do outro lado de uma troca de horário de verão. O
 * Brasil não tem mais horário de verão, mas o fuso é um parâmetro.
 */
export function startOfBusinessDay(key: string, timeZone: string = BUSINESS_TIME_ZONE): Date {
  const [year, month, day] = key.split("-").map(Number);
  const wall = Date.UTC(year, month - 1, day, 0, 0, 0);
  let ts = wall;
  for (let i = 0; i < 2; i++) {
    ts = wall - offsetMs(new Date(ts), timeZone);
  }
  return new Date(ts);
}

export interface PortalPeriod {
  days: PortalDays;
  /** Início do primeiro dia local da janela. */
  from: Date;
  /** Fim da janela: `now` no período atual, o `from` do atual no anterior. */
  to: Date;
  /** Uma chave `YYYY-MM-DD` por dia, em ordem crescente. */
  keys: string[];
}

export function portalPeriod(
  days: PortalDays,
  now: Date = new Date(),
  timeZone: string = BUSINESS_TIME_ZONE,
): PortalPeriod {
  const keys = dayKeysEndingAt(now, days, timeZone);
  return { days, from: startOfBusinessDay(keys[0], timeZone), to: now, keys };
}

/**
 * A janela imediatamente anterior, do mesmo tamanho. Termina exatamente onde a
 * atual começa — um play na fronteira em ambos os lados inflaria o delta duas
 * vezes.
 */
export function previousPortalPeriod(
  days: PortalDays,
  now: Date = new Date(),
  timeZone: string = BUSINESS_TIME_ZONE,
): PortalPeriod {
  const all = dayKeysEndingAt(now, days * 2, timeZone);
  const keys = all.slice(0, days);
  return {
    days,
    from: startOfBusinessDay(keys[0], timeZone),
    to: startOfBusinessDay(all[days], timeZone),
    keys,
  };
}
