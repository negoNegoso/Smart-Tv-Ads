/**
 * Códigos de tempo do Open-Meteo (padrão WMO) em português de quem olha a TV.
 * Agrupados: a tela não tem espaço (nem quem passa tem paciência) para
 * diferenciar 51, 53 e 55.
 */
const LABELS: Record<number, string> = {
  0: "Céu limpo",
  1: "Predomínio de sol",
  2: "Parcialmente nublado",
  3: "Nublado",
  45: "Neblina",
  48: "Neblina",
  51: "Garoa",
  53: "Garoa",
  55: "Garoa",
  56: "Garoa congelante",
  57: "Garoa congelante",
  61: "Chuva fraca",
  63: "Chuva",
  65: "Chuva forte",
  66: "Chuva congelante",
  67: "Chuva congelante",
  71: "Neve",
  73: "Neve",
  75: "Neve",
  77: "Neve",
  80: "Pancadas de chuva",
  81: "Pancadas fortes",
  82: "Temporal",
  85: "Neve",
  86: "Neve",
  95: "Trovoadas",
  96: "Trovoadas",
  99: "Trovoadas",
};

export function weatherLabel(code: number): string {
  return LABELS[code] ?? "Tempo instável";
}
