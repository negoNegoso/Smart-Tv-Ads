import { describe, expect, it } from "vitest";
import { renderWeather } from "../render";

function pngSize(buffer: Buffer): { width: number; height: number } {
  expect(buffer.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const arte = {
  city: "São José dos Campos",
  clock: "quarta, 7 de outubro · 15:42",
  forecast: {
    current: { temperature: 27.6, code: 2 },
    today: { max: 31.2, min: 18.4, code: 2 },
    nextDays: [
      { date: "2026-10-08", max: 26.4, min: 17.0, code: 61 },
      { date: "2026-10-09", max: 24.9, min: 16.2, code: 3 },
      { date: "2026-10-10", max: 29.1, min: 15.8, code: 0 },
    ],
  },
};

describe("renderWeather", () => {
  it("deitado vira PNG 1920×1080", async () => {
    expect(pngSize(await renderWeather(arte, "landscape"))).toEqual({ width: 1920, height: 1080 });
  });

  it("em pé vira PNG 1080×1920, mesmo sem previsão", async () => {
    expect(pngSize(await renderWeather({ ...arte, forecast: null }, "portrait"))).toEqual({ width: 1080, height: 1920 });
  });
});
