/**
 * Ícones de tempo do slide de clima, desenhados em SVG: nítidos em qualquer
 * tamanho de TV e sem asset novo no bundle. Os gradientes imitam o volume dos
 * ícones 3D da referência de design, dentro do que o resvg desenha.
 */
export type IconKind = "sun" | "partly" | "cloud" | "fog" | "rain" | "storm" | "snow";

/** Mesmo agrupamento de weather-codes.ts: garoa e chuva dividem o ícone de chuva. */
export function iconFor(code: number): IconKind {
  if (code === 0) return "sun";
  if (code === 1 || code === 2) return "partly";
  if (code === 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 51 && code <= 67) || code === 80 || code === 81) return "rain";
  if (code === 82 || code === 95 || code === 96 || code === 99) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  // Código fora da tabela: nuvem é o mais neutro, como o "Tempo instável" do rótulo.
  return "cloud";
}

const DEFS = `<defs>
<linearGradient id="cloud" x1="0" y1="24" x2="0" y2="76" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#CFE6E1"/></linearGradient>
<radialGradient id="sun" cx="0.38" cy="0.35" r="0.7"><stop offset="0" stop-color="#FFF1A8"/><stop offset="0.55" stop-color="#FFC93C"/><stop offset="1" stop-color="#F59E0B"/></radialGradient>
<radialGradient id="glow"><stop offset="0.6" stop-color="#FFD54A" stop-opacity="0.45"/><stop offset="1" stop-color="#FFD54A" stop-opacity="0"/></radialGradient>
<linearGradient id="drop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7DE3FF"/><stop offset="1" stop-color="#2F7BEA"/></linearGradient>
<linearGradient id="bolt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE27A"/><stop offset="1" stop-color="#F59E0B"/></linearGradient>
</defs>`;

/** Nuvem em caixa ~66×50 começando em (20, 26); `dy` sobe ou desce para abrir espaço a chuva e neve. */
const cloud = (dy = 0) => `<g transform="translate(0 ${dy})" fill="url(#cloud)">
<circle cx="37" cy="56" r="15"/><circle cx="55" cy="46" r="20"/><circle cx="72" cy="58" r="13"/><rect x="22" y="56" width="62" height="18" rx="9"/>
</g>`;

const sun = (cx: number, cy: number, r: number) =>
  `<circle cx="${cx}" cy="${cy}" r="${r + 12}" fill="url(#glow)"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#sun)"/>`;

const drop = (x: number, y: number) =>
  `<path d="M${x} ${y} q5 7 5 10.5 a5 5 0 0 1 -10 0 q0 -3.5 5 -10.5 z" fill="url(#drop)"/>`;

const BODIES: Record<IconKind, string> = {
  sun: sun(50, 50, 26),
  partly: sun(64, 36, 18) + cloud(6),
  cloud: cloud(),
  fog:
    cloud(-8) +
    `<g stroke="#9FEBDB" stroke-width="5" stroke-linecap="round"><line x1="24" y1="78" x2="76" y2="78"/><line x1="32" y1="89" x2="70" y2="89"/></g>`,
  rain: cloud(-10) + drop(36, 72) + drop(52, 78) + drop(68, 72),
  storm:
    cloud(-10) +
    `<path d="M54 62 L40 82 L50 82 L44 98 L64 74 L53 74 L60 62 z" fill="url(#bolt)"/>` +
    drop(30, 70) +
    drop(74, 70),
  snow:
    cloud(-10) +
    `<g fill="#FFFFFF"><circle cx="34" cy="80" r="4"/><circle cx="50" cy="88" r="4"/><circle cx="66" cy="80" r="4"/><circle cx="42" cy="95" r="3"/><circle cx="58" cy="95" r="3"/></g>`,
};

export function iconSvg(kind: IconKind): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">${DEFS}${BODIES[kind]}</svg>`;
}

/** Nó img do satori: o SVG vai em data URI e o resvg desenha junto com o resto da arte. */
export function weatherIcon(code: number, size: number): unknown {
  const src = `data:image/svg+xml;base64,${Buffer.from(iconSvg(iconFor(code))).toString("base64")}`;
  return { type: "img", props: { src, width: size, height: size } };
}
