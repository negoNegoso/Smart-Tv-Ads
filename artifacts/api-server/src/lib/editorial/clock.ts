const TIME_ZONE = "America/Sao_Paulo";

/**
 * "quarta, 7 de outubro · 15:42" no fuso de quem olha a TV. Sai de `Intl`,
 * nunca de getHours(): o servidor roda em UTC. O "-feira" sai para caber na
 * linha sem perder nada que alguém precise ler.
 */
export function formatClock(now: Date): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = get("weekday").replace("-feira", "");
  return `${weekday}, ${get("day")} de ${get("month")} · ${get("hour")}:${get("minute")}`;
}
