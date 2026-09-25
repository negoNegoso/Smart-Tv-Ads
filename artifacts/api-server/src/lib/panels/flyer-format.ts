const MAX_UNIT = 12;

// Datas de campanha são dias guardados como meia-noite UTC (o form do admin
// manda "2026-09-27" e o z.coerce.date vira 2026-09-27T00:00Z). Por isso o
// dia sai em UTC, espelhando o admin (campaign-row/campaign-detail); em
// Brasília a meia-noite UTC ainda é o dia anterior e a validade sairia um
// dia antes. Criado uma vez só: Intl.DateTimeFormat é caro de montar.
const DAY_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function dayParts(date: Date): { day: string; month: string; year: string } {
  const parts = DAY_FORMAT.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { day: get("day"), month: get("month"), year: get("year") };
}

/** Linha de validade do cabeçalho, a partir das datas da campanha. */
export function flyerValidityLabel(startsAt: Date, endsAt: Date): string {
  const a = dayParts(startsAt);
  const b = dayParts(endsAt);
  const withYear = a.year !== b.year;
  const fmt = (p: typeof a) => (withYear ? `${p.day}/${p.month}/${p.year}` : `${p.day}/${p.month}`);
  return `OFERTAS VÁLIDAS DE ${fmt(a)} A ${fmt(b)}`;
}

type Nullable = string | null | undefined;

/** Endereço de uma linha para o rodapé; null quando a empresa não tem nada cadastrado. */
export function formatStoreAddress(c: {
  street: Nullable;
  number: Nullable;
  district: Nullable;
  city: Nullable;
  state: Nullable;
}): string | null {
  const clean = (v: Nullable) => v?.trim() || null;
  const streetLine = [clean(c.street), clean(c.number)].filter(Boolean).join(", ");
  const place = [clean(c.city), clean(c.state)].filter(Boolean).join("/");
  const head = [streetLine, clean(c.district)].filter(Boolean).join(" - ");
  const full = [head, place].filter(Boolean).join(", ");
  return full || null;
}

const INTEGER = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** Preço em duas partes: o inteiro vai grande e os centavos menores, como no folheto. */
export function flyerPriceParts(cents: number): { integer: string; decimals: string } {
  const integer = INTEGER.format(Math.floor(cents / 100));
  const decimals = `,${String(cents % 100).padStart(2, "0")}`;
  return { integer, decimals };
}

/** Unidade como vai na arte: maiúsculas, até 12 caracteres, vazio = sem unidade. */
export function normalizeUnit(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase().slice(0, MAX_UNIT);
}
