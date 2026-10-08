import { weatherLabel } from "./weather-codes";
import { weatherIcon } from "./weather-icons";
import type { Forecast } from "./forecast";

export type WeatherArt = { city: string; clock: string; forecast: Forecast | null };
export type WeatherOrientation = "landscape" | "portrait";

// Teal da marca (#28D8B3, o --primary do portal) sobre verde-petróleo escuro:
// o slide fica com a cara do produto e lê como "informação", não como anúncio
// nem como aviso (que é vermelho).
const COLORS = {
  background: "linear-gradient(180deg, #071A1C 0%, #0A3833 55%, #0E6B5D 100%)",
  text: "#FFFFFF",
  muted: "#9FEBDB",
  pill: "rgba(255, 255, 255, 0.08)",
  pillBorder: "rgba(255, 255, 255, 0.16)",
  // Texto escuro sobre o teal, como nos botões do portal: branco daria 1,8:1.
  today: "#28D8B3",
  todayText: "#04201B",
};

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

type PillDay = { label: string; code: number; max: number; min: number; today: boolean };

/** Pílula de um dia; a de hoje ganha o destaque que o "Now" tem na referência, na cor da marca. */
function pill(day: PillDay, portrait: boolean): unknown {
  return node("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 16,
      width: portrait ? 210 : 270,
      padding: "36px 0",
      borderRadius: 120,
      color: day.today ? COLORS.todayText : COLORS.text,
      ...(day.today
        ? { backgroundColor: COLORS.today, border: `2px solid ${COLORS.today}`, boxShadow: "0 16px 40px rgba(0, 0, 0, 0.45)" }
        : { backgroundColor: COLORS.pill, border: `2px solid ${COLORS.pillBorder}` }),
    },
    children: [
      text(day.label, { fontSize: 40, fontWeight: 700, color: day.today ? COLORS.todayText : COLORS.muted }),
      weatherIcon(day.code, portrait ? 120 : 130),
      text(`${degrees(day.max)} / ${degrees(day.min)}`, { fontSize: 38 }),
    ],
  });
}

export function weatherNode(art: WeatherArt, orientation: WeatherOrientation): unknown {
  const portrait = orientation === "portrait";
  const forecast = art.forecast;
  const align = portrait ? "center" : "flex-start";

  const city = text(art.city, { fontSize: portrait ? 64 : 60, fontWeight: 700, textAlign: portrait ? "center" : "left" });

  const body = forecast
    ? [
        node("div", {
          style: {
            display: "flex",
            flexDirection: portrait ? "column" : "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: portrait ? 24 : 48,
          },
          children: [
            node("div", {
              style: { display: "flex", flexDirection: "column", alignItems: align, gap: 12 },
              children: [
                city,
                text(degrees(forecast.current.temperature), { fontSize: portrait ? 300 : 260, fontWeight: 400, lineHeight: 1 }),
                text(weatherLabel(forecast.current.code), { fontSize: 56, fontWeight: 700, color: COLORS.muted }),
                text(`Máx ${degrees(forecast.today.max)} · Mín ${degrees(forecast.today.min)}`, { fontSize: 44, fontWeight: 700 }),
              ],
            }),
            weatherIcon(forecast.current.code, portrait ? 420 : 400),
          ],
        }),
        node("div", {
          style: { display: "flex", flexDirection: "row", justifyContent: portrait ? "center" : "flex-start", gap: portrait ? 24 : 36 },
          children: [
            { label: "Hoje", ...forecast.today, today: true },
            ...forecast.nextDays.map((day) => ({ label: weekdayShort(day.date), ...day, today: false })),
          ].map((day) => pill(day, portrait)),
        }),
      ]
    : [city, text("Previsão indisponível", { fontSize: 72, fontWeight: 700, color: COLORS.muted })];

  return node("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      alignItems: portrait ? "center" : "stretch",
      width: "100%",
      height: "100%",
      padding: portrait ? "120px 80px" : "80px 120px",
      backgroundImage: COLORS.background,
      color: COLORS.text,
      fontFamily: "Inter",
    },
    children: [...body, text(art.clock, { fontSize: 44, color: COLORS.muted })],
  });
}
