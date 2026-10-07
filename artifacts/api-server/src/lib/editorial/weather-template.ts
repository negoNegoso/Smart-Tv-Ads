import { weatherLabel } from "./weather-codes";
import type { Forecast } from "./forecast";

export type WeatherArt = { city: string; clock: string; forecast: Forecast | null };
export type WeatherOrientation = "landscape" | "portrait";

// Azul de céu: tem de ler como "informação", não como anúncio nem como aviso.
const COLORS = { background: "#0C4A6E", text: "#FFFFFF", muted: "#BAE6FD" };

const node = (type: string, props: Record<string, unknown>) => ({ type, props });
const degrees = (value: number) => `${Math.round(value)}°`;

/** "2026-10-08" → "Qui". Meio-dia em São Paulo: nenhum fuso empurra para outro dia. */
export function weekdayShort(date: string): string {
  const label = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "America/Sao_Paulo" })
    .format(new Date(`${date}T12:00:00-03:00`))
    .replace(".", "");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const text = (content: string, style: Record<string, unknown>) =>
  node("div", { style: { wordBreak: "break-word", ...style }, children: content });

export function weatherNode(art: WeatherArt, orientation: WeatherOrientation): unknown {
  const portrait = orientation === "portrait";
  const forecast = art.forecast;

  const body = forecast
    ? [
        node("div", {
          style: { display: "flex", flexDirection: portrait ? "column" : "row", alignItems: portrait ? "flex-start" : "center", gap: 48 },
          children: [
            text(degrees(forecast.current.temperature), { fontSize: portrait ? 240 : 220, fontWeight: 700, lineHeight: 1 }),
            node("div", {
              style: { display: "flex", flexDirection: "column", gap: 16 },
              children: [
                text(weatherLabel(forecast.current.code), { fontSize: 64, fontWeight: 700 }),
                text(`máx ${degrees(forecast.today.max)} · mín ${degrees(forecast.today.min)}`, { fontSize: 48, color: COLORS.muted }),
              ],
            }),
          ],
        }),
        node("div", {
          style: { display: "flex", flexDirection: "row", gap: portrait ? 56 : 96 },
          children: forecast.nextDays.map((day) =>
            node("div", {
              style: { display: "flex", flexDirection: "column", gap: 8 },
              children: [
                text(weekdayShort(day.date), { fontSize: 44, fontWeight: 700 }),
                text(`${degrees(day.max)} / ${degrees(day.min)}`, { fontSize: 44, color: COLORS.muted }),
              ],
            }),
          ),
        }),
      ]
    : [text("Previsão indisponível", { fontSize: 72, fontWeight: 700 })];

  return node("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      width: "100%",
      height: "100%",
      padding: portrait ? "120px 80px" : "80px 120px",
      backgroundColor: COLORS.background,
      color: COLORS.text,
      fontFamily: "Inter",
    },
    children: [
      text(art.city, { fontSize: 56, fontWeight: 700, color: COLORS.muted }),
      ...body,
      text(art.clock, { fontSize: 48 }),
    ],
  });
}
