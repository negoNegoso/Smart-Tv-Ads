import { describe, expect, it } from "vitest";
import { countOnlineDays, deviceOnlineDays } from "../device-days";

const TZ = "America/Sao_Paulo";
const KEYS = ["2026-09-10", "2026-09-11", "2026-09-12"];
const TV = { id: 2, createdAt: new Date("2026-01-01T00:00:00Z") };
const sessao = (startedAt: string, lastSeenAt: string) => ({ startedAt: new Date(startedAt), lastSeenAt: new Date(lastSeenAt) });

describe("deviceOnlineDays", () => {
  it("true no dia com sessão, false nos outros", () => {
    const dias = deviceOnlineDays(KEYS, [sessao("2026-09-11T12:00:00Z", "2026-09-11T20:00:00Z")], TV, "2026-09-01", TZ);
    expect(dias).toEqual([
      { date: "2026-09-10", online: false },
      { date: "2026-09-11", online: true },
      { date: "2026-09-12", online: false },
    ]);
  });

  // Antes do cadastro a TV não existia: não é "parada".
  it("dia antes do cadastro da TV é null", () => {
    const tv = { id: 2, createdAt: new Date("2026-09-11T15:00:00Z") };
    expect(deviceOnlineDays(KEYS, [], tv, "2026-09-01", TZ).map((d) => d.online)).toEqual([null, false, false]);
  });

  it("dia antes do começo do histórico é null", () => {
    expect(deviceOnlineDays(KEYS, [], TV, "2026-09-11", TZ).map((d) => d.online)).toEqual([null, false, false]);
  });
});

describe("countOnlineDays", () => {
  it("conta só os dias com histórico", () => {
    expect(
      countOnlineDays([
        { date: "a", online: null },
        { date: "b", online: true },
        { date: "c", online: false },
        { date: "d", online: true },
      ]),
    ).toEqual({ daysOnline: 2, daysWithHistory: 3 });
  });
});
