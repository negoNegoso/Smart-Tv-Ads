import { describe, expect, it } from "vitest";
import { dailyAvailability, nextDayKey } from "../availability";

// São Paulo é UTC−3: o dia local 2026-09-10 vai de 03:00Z do dia 10 a 03:00Z do dia 11.
const TZ = "America/Sao_Paulo";
const KEYS = ["2026-09-10", "2026-09-11", "2026-09-12"];
const at = (iso: string) => new Date(iso);
const TV = (id: number, createdAt = "2026-01-01T00:00:00Z") => ({ id, createdAt: at(createdAt) });
const sessao = (deviceId: number, startedAt: string, lastSeenAt: string) => ({
  deviceId,
  startedAt: at(startedAt),
  lastSeenAt: at(lastSeenAt),
});

describe("nextDayKey", () => {
  it("vira o mês e o ano", () => {
    expect(nextDayKey("2026-09-30")).toBe("2026-10-01");
    expect(nextDayKey("2026-12-31")).toBe("2027-01-01");
  });
});

describe("dailyAvailability", () => {
  it("conta a TV no dia em que teve sessão e não nos outros", () => {
    const pontos = dailyAvailability(
      KEYS,
      [sessao(1, "2026-09-11T12:00:00Z", "2026-09-11T20:00:00Z")],
      [TV(1), TV(2)],
      "2026-09-01",
      TZ,
    );
    expect(pontos).toEqual([
      { date: "2026-09-10", activeDevices: 0, totalDevices: 2 },
      { date: "2026-09-11", activeDevices: 1, totalDevices: 2 },
      { date: "2026-09-12", activeDevices: 0, totalDevices: 2 },
    ]);
  });

  // 23h às 2h de São Paulo: sem isso, o segundo dia acusaria TV parada.
  it("sessão que atravessa a meia-noite conta nos dois dias", () => {
    const pontos = dailyAvailability(
      KEYS,
      [sessao(1, "2026-09-11T02:00:00Z", "2026-09-11T05:00:00Z")],
      [TV(1)],
      "2026-09-01",
      TZ,
    );
    expect(pontos.map((p) => p.activeDevices)).toEqual([1, 1, 0]);
  });

  it("TV com duas sessões no mesmo dia conta uma vez", () => {
    const pontos = dailyAvailability(
      KEYS,
      [sessao(1, "2026-09-11T12:00:00Z", "2026-09-11T13:00:00Z"), sessao(1, "2026-09-11T18:00:00Z", "2026-09-11T19:00:00Z")],
      [TV(1)],
      "2026-09-01",
      TZ,
    );
    expect(pontos[1].activeDevices).toBe(1);
  });

  // Instalada no dia 11 (local): não pode virar falha no dia 10.
  it("TV cadastrada no meio do período só entra no total a partir do dia dela", () => {
    const pontos = dailyAvailability(KEYS, [], [TV(1), TV(2, "2026-09-11T15:00:00Z")], "2026-09-01", TZ);
    expect(pontos.map((p) => p.totalDevices)).toEqual([1, 2, 2]);
  });

  // Zero diria que a rede inteira caiu; antes do histórico a resposta é "não sei".
  it("dia anterior ao começo do histórico vira null", () => {
    const pontos = dailyAvailability(
      KEYS,
      [sessao(1, "2026-09-11T12:00:00Z", "2026-09-11T20:00:00Z")],
      [TV(1)],
      "2026-09-11",
      TZ,
    );
    expect(pontos.map((p) => p.activeDevices)).toEqual([null, 1, 0]);
    expect(pontos[0].totalDevices).toBe(1);
  });

  it("sem nenhuma sessão registrada, todos os dias são null", () => {
    const pontos = dailyAvailability(KEYS, [], [TV(1)], null, TZ);
    expect(pontos.map((p) => p.activeDevices)).toEqual([null, null, null]);
  });
});
