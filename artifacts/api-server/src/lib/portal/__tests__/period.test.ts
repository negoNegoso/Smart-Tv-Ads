import { describe, expect, it } from "vitest";
import {
  DEFAULT_PORTAL_DAYS,
  businessDayKey,
  dayKeysEndingAt,
  parseDays,
  portalPeriod,
  previousPortalPeriod,
  startOfBusinessDay,
} from "../period";

describe("parseDays", () => {
  it("aceita os três presets, como número ou string", () => {
    expect(parseDays(7)).toBe(7);
    expect(parseDays("30")).toBe(30);
    expect(parseDays(90)).toBe(90);
  });

  it("cai no padrão quando ausente", () => {
    expect(parseDays(undefined)).toBe(DEFAULT_PORTAL_DAYS);
    expect(parseDays("")).toBe(DEFAULT_PORTAL_DAYS);
  });

  // Enum fechado, não número livre: 3650 seria uma varredura de dez anos na
  // maior tabela do banco, disparada por quem só sabe editar a URL.
  it("recusa qualquer outro valor", () => {
    expect(parseDays(1)).toBeNull();
    expect(parseDays(31)).toBeNull();
    expect(parseDays(3650)).toBeNull();
    expect(parseDays("trinta")).toBeNull();
    expect(parseDays(-30)).toBeNull();
  });
});

describe("businessDayKey", () => {
  // 2026-09-05T23:30Z é 20h30 de 5 de setembro em São Paulo: mesmo dia.
  it("usa a data local do negócio, não a UTC", () => {
    expect(businessDayKey(new Date("2026-09-05T23:30:00.000Z"))).toBe("2026-09-05");
  });

  // 2026-09-06T02:00Z é 23h de 5 de setembro em São Paulo. Em UTC já é dia 6;
  // para quem assiste à TV, ainda é dia 5.
  it("não adianta o dia depois das 21h de Brasília", () => {
    expect(businessDayKey(new Date("2026-09-06T02:00:00.000Z"))).toBe("2026-09-05");
  });
});

describe("dayKeysEndingAt", () => {
  it("devolve exatamente `days` chaves, em ordem, terminando no dia local", () => {
    const keys = dayKeysEndingAt(new Date("2026-09-05T15:00:00.000Z"), 7);
    expect(keys).toEqual([
      "2026-08-30", "2026-08-31", "2026-09-01",
      "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05",
    ]);
  });

  it("atravessa a virada de mês", () => {
    const keys = dayKeysEndingAt(new Date("2026-03-02T15:00:00.000Z"), 3);
    expect(keys).toEqual(["2026-02-28", "2026-03-01", "2026-03-02"]);
  });

  it("devolve 90 chaves distintas para o preset maior", () => {
    const keys = dayKeysEndingAt(new Date("2026-09-05T15:00:00.000Z"), 90);
    expect(keys).toHaveLength(90);
    expect(new Set(keys).size).toBe(90);
  });
});

describe("startOfBusinessDay", () => {
  // Meia-noite em São Paulo (UTC-3) é 03:00Z do mesmo dia.
  it("devolve o instante em que a data local começa", () => {
    expect(startOfBusinessDay("2026-09-05").toISOString()).toBe("2026-09-05T03:00:00.000Z");
  });
});

describe("portalPeriod", () => {
  const now = new Date("2026-09-05T15:00:00.000Z");

  it("cobre `days` dias terminando hoje", () => {
    const period = portalPeriod(7, now);
    expect(period.days).toBe(7);
    expect(period.keys).toHaveLength(7);
    expect(period.keys.at(-1)).toBe("2026-09-05");
    expect(period.from.toISOString()).toBe("2026-08-30T03:00:00.000Z");
    expect(period.to).toEqual(now);
  });
});

describe("previousPortalPeriod", () => {
  const now = new Date("2026-09-05T15:00:00.000Z");

  it("cobre a janela imediatamente anterior, do mesmo tamanho", () => {
    const previous = previousPortalPeriod(7, now);
    expect(previous.keys).toHaveLength(7);
    expect(previous.keys[0]).toBe("2026-08-23");
    expect(previous.keys.at(-1)).toBe("2026-08-29");
  });

  // Um play na fronteira não pode entrar nos dois períodos: o delta ficaria
  // inflado dos dois lados.
  it("termina exatamente onde o período atual começa", () => {
    const current = portalPeriod(30, now);
    const previous = previousPortalPeriod(30, now);
    expect(previous.to.toISOString()).toBe(current.from.toISOString());
  });
});
