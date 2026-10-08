import { describe, expect, it } from "vitest";

const previousDatabaseUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
const { weatherImageUrl } = await import("../editorial-piece");
if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
else process.env.DATABASE_URL = previousDatabaseUrl;

describe("weatherImageUrl", () => {
  it("aponta para a rota da imagem com empresa, orientação e minuto", () => {
    const now = new Date("2026-10-07T18:42:30Z");
    expect(weatherImageUrl(12, "portrait", now)).toBe(
      `/api/editorial/weather.png?company=12&o=portrait&m=${Math.floor(now.getTime() / 60_000)}`,
    );
  });

  it("muda a cada minuto e não dentro do mesmo minuto", () => {
    const a = weatherImageUrl(12, "landscape", new Date("2026-10-07T18:42:01Z"));
    const b = weatherImageUrl(12, "landscape", new Date("2026-10-07T18:42:59Z"));
    const c = weatherImageUrl(12, "landscape", new Date("2026-10-07T18:43:00Z"));
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });
});
