import { truncate } from "../panels/format";

/** Limites de caractere; a API recusa acima disso e o template corta por garantia. */
export const MAX_ALERT_TITLE = 60;
export const MAX_ALERT_BODY = 140;

export type AlertOrientation = "landscape" | "portrait";
export type AlertArt = { title: string; body: string | null };

/** Deitado é a TV comum; em pé é a TV girada na parede (as duas existem na rede). */
export function alertSize(orientation: AlertOrientation): { width: number; height: number } {
  return orientation === "portrait" ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
}

// Vermelho escuro com faixa amarela: tem de parecer aviso, não anúncio.
const COLORS = {
  background: "#7F1D1D",
  band: "#FBBF24",
  bandText: "#1F2937",
  text: "#FFFFFF",
  muted: "#FECACA",
};

/** Nó satori: mesma forma de um elemento React, sem depender do React aqui. */
const node = (type: string, props: Record<string, unknown>) => ({ type, props });

export function alertNode(art: AlertArt, orientation: AlertOrientation): unknown {
  const portrait = orientation === "portrait";
  return node("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      backgroundColor: COLORS.background,
      color: COLORS.text,
      fontFamily: "Inter",
    },
    children: [
      node("div", {
        style: {
          display: "flex",
          alignItems: "center",
          height: portrait ? 160 : 120,
          padding: "0 80px",
          backgroundColor: COLORS.band,
          color: COLORS.bandText,
          fontSize: portrait ? 64 : 56,
          fontWeight: 700,
          letterSpacing: 4,
        },
        children: "AVISO",
      }),
      node("div", {
        style: {
          display: "flex",
          flexDirection: "column",
          flex: 1,
          justifyContent: "center",
          gap: 40,
          padding: portrait ? "0 80px" : "0 120px",
        },
        children: [
          node("div", {
            style: { fontSize: portrait ? 104 : 112, fontWeight: 700, lineHeight: 1.1, wordBreak: "break-word" },
            children: truncate(art.title, MAX_ALERT_TITLE),
          }),
          art.body
            ? node("div", {
                style: { fontSize: portrait ? 52 : 56, color: COLORS.muted, lineHeight: 1.3, wordBreak: "break-word" },
                children: truncate(art.body, MAX_ALERT_BODY),
              })
            : null,
        ].filter(Boolean),
      }),
    ],
  });
}
