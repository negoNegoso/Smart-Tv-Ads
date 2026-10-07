import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearForecastCache, fetchForecast, forecastUrl, parseForecast } from "../forecast";

const RESPOSTA = {
  current: { temperature_2m: 27.6, weather_code: 2 },
  daily: {
    time: ["2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"],
    weather_code: [2, 61, 3, 0],
    temperature_2m_max: [31.2, 26.4, 24.9, 29.1],
    temperature_2m_min: [18.4, 17.0, 16.2, 15.8],
  },
};

describe("parseForecast", () => {
  it("lê agora, hoje e os 3 dias seguintes", () => {
    expect(parseForecast(RESPOSTA)).toEqual({
      current: { temperature: 27.6, code: 2 },
      today: { max: 31.2, min: 18.4, code: 2 },
      nextDays: [
        { date: "2026-10-08", max: 26.4, min: 17.0, code: 61 },
        { date: "2026-10-09", max: 24.9, min: 16.2, code: 3 },
        { date: "2026-10-10", max: 29.1, min: 15.8, code: 0 },
      ],
    });
  });

  it.each([
    ["sem current", { daily: RESPOSTA.daily }],
    ["temperatura nula", { ...RESPOSTA, current: { temperature_2m: null, weather_code: 2 } }],
    ["só 3 dias", { ...RESPOSTA, daily: { ...RESPOSTA.daily, time: RESPOSTA.daily.time.slice(0, 3) } }],
    ["máxima nula num dia", { ...RESPOSTA, daily: { ...RESPOSTA.daily, temperature_2m_max: [31.2, null, 24.9, 29.1] } }],
    ["não é objeto", "erro"],
  ])("resposta incompleta (%s) → null", (_caso, json) => {
    expect(parseForecast(json)).toBeNull();
  });
});

describe("fetchForecast", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    clearForecastCache();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const ok = () => Promise.resolve(new Response(JSON.stringify(RESPOSTA), { status: 200 }));
  const agora = new Date("2026-10-07T18:00:00Z");

  it("pede ao Open-Meteo com as coordenadas, o fuso e 4 dias", async () => {
    fetchMock.mockImplementation(ok);
    await fetchForecast(-23.1794, -45.8869, agora);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe("https://api.open-meteo.com/v1/forecast");
    expect(url.searchParams.get("latitude")).toBe("-23.1794");
    expect(url.searchParams.get("longitude")).toBe("-45.8869");
    expect(url.searchParams.get("current")).toBe("temperature_2m,weather_code");
    expect(url.searchParams.get("daily")).toBe("weather_code,temperature_2m_max,temperature_2m_min");
    expect(url.searchParams.get("timezone")).toBe("America/Sao_Paulo");
    expect(url.searchParams.get("forecast_days")).toBe("4");
    expect(forecastUrl(-23.1794, -45.8869)).toBe(String(fetchMock.mock.calls[0][0]));
  });

  it("usa o cache por 30 min e busca de novo depois", async () => {
    fetchMock.mockImplementation(ok);
    await fetchForecast(-23.18, -45.89, agora);
    await fetchForecast(-23.18, -45.89, new Date(agora.getTime() + 29 * 60_000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await fetchForecast(-23.18, -45.89, new Date(agora.getTime() + 31 * 60_000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("coordenadas que arredondam igual dividem o cache", async () => {
    fetchMock.mockImplementation(ok);
    await fetchForecast(-23.1794, -45.8869, agora);
    await fetchForecast(-23.1801, -45.8899, agora);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["erro de rede", () => Promise.reject(new Error("ECONNRESET"))],
    ["status 500", () => Promise.resolve(new Response("x", { status: 500 }))],
    ["corpo incompleto", () => Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))],
  ])("%s → null, sem lançar e sem guardar no cache", async (_caso, falha) => {
    fetchMock.mockImplementationOnce(falha).mockImplementation(ok);
    expect(await fetchForecast(-23.18, -45.89, agora)).toBeNull();
    expect(await fetchForecast(-23.18, -45.89, agora)).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("passa um sinal de timeout para o fetch", async () => {
    fetchMock.mockImplementation(ok);
    await fetchForecast(-23.18, -45.89, agora);
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });
});
