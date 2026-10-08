export type ForecastDay = { date: string; max: number; min: number; code: number };
export type Forecast = {
  current: { temperature: number; code: number };
  today: { max: number; min: number; code: number };
  nextDays: ForecastDay[];
};

/** Quanto tempo a previsão de uma coordenada vale: tempo muda devagar, e cada TV pede a imagem a cada volta. */
const CACHE_TTL_MS = 30 * 60_000;
/** O Open-Meteo responde em ~100 ms; acima disso a arte sai sem previsão em vez de segurar a TV. */
const TIMEOUT_MS = 3000;

const cache = new Map<string, { at: number; forecast: Forecast }>();

/** Só para testes. */
export function clearForecastCache(): void {
  cache.clear();
}

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * Resposta do Open-Meteo → previsão da arte. Qualquer campo faltando ou nulo
 * vira null: meia previsão na tela (um dia em branco, "NaN°") é pior que
 * nenhuma.
 */
export function parseForecast(json: unknown): Forecast | null {
  if (!json || typeof json !== "object") return null;
  const data = json as {
    current?: { temperature_2m?: unknown; weather_code?: unknown };
    daily?: { time?: unknown; weather_code?: unknown; temperature_2m_max?: unknown; temperature_2m_min?: unknown };
  };
  const current = data.current;
  const daily = data.daily;
  if (!current || !daily || !isNumber(current.temperature_2m) || !isNumber(current.weather_code)) return null;
  const { time, weather_code: codes, temperature_2m_max: maxs, temperature_2m_min: mins } = daily;
  if (!Array.isArray(time) || !Array.isArray(codes) || !Array.isArray(maxs) || !Array.isArray(mins)) return null;
  if (time.length < 4) return null;

  const days: ForecastDay[] = [];
  for (let i = 0; i < 4; i++) {
    const date = time[i];
    const code = codes[i];
    const max = maxs[i];
    const min = mins[i];
    if (typeof date !== "string" || !isNumber(code) || !isNumber(max) || !isNumber(min)) return null;
    days.push({ date, code, max, min });
  }
  const [today, ...nextDays] = days;
  return {
    current: { temperature: current.temperature_2m, code: current.weather_code },
    today: { max: today.max, min: today.min, code: today.code },
    nextDays,
  };
}

export function forecastUrl(lat: number, lng: number): string {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    current: "temperature_2m,weather_code",
    daily: "weather_code,temperature_2m_max,temperature_2m_min",
    timezone: "America/Sao_Paulo",
    forecast_days: "4",
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

/**
 * Previsão da coordenada, com cache de 30 min por coordenada arredondada a 2
 * casas (~1 km: lojas da mesma cidade dividem a mesma busca). Nunca lança:
 * erro, timeout ou resposta ruim devolvem null, e null não entra no cache —
 * o próximo pedido tenta de novo.
 */
export async function fetchForecast(lat: number, lng: number, now: Date = new Date()): Promise<Forecast | null> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && now.getTime() - hit.at < CACHE_TTL_MS) return hit.forecast;
  try {
    const res = await fetch(forecastUrl(lat, lng), { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const forecast = parseForecast(await res.json());
    if (forecast) cache.set(key, { at: now.getTime(), forecast });
    return forecast;
  } catch {
    return null;
  }
}
