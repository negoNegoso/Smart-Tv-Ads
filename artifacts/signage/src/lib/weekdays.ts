/**
 * Dias da semana da campanha, no padrão do `Date.getDay()`:
 * 0 = domingo … 6 = sábado. Lista vazia é "todo dia" — o servidor guarda a
 * semana cheia assim, então as duas formas caem no mesmo rótulo.
 */
export const WEEKDAYS = [
  { value: 0, short: "D", label: "Dom" },
  { value: 1, short: "S", label: "Seg" },
  { value: 2, short: "T", label: "Ter" },
  { value: 3, short: "Q", label: "Qua" },
  { value: 4, short: "Q", label: "Qui" },
  { value: 5, short: "S", label: "Sex" },
  { value: 6, short: "S", label: "Sáb" },
] as const;

export function weekdaysLabel(weekdays: number[] | undefined): string {
  if (!weekdays || weekdays.length === 0 || weekdays.length === 7) return "Todo dia";
  return [...weekdays]
    .sort((a, b) => a - b)
    .map((day) => WEEKDAYS[day]?.label)
    .filter(Boolean)
    .join(", ");
}
