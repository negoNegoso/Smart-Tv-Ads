import { describe, expect, it } from "vitest";
import { campaignWindow } from "../campaign-window";

const TZ = "America/Sao_Paulo";
// 01/09 00:00 local até 30/09 23:59:59 local.
const STARTS = new Date("2026-09-01T03:00:00Z");
const ENDS = new Date("2026-10-01T02:59:59Z");

describe("campaignWindow", () => {
  it("agendada: ainda não começou, sem dias", () => {
    const w = campaignWindow(STARTS, ENDS, new Date("2026-08-20T12:00:00Z"), TZ);
    expect(w.status).toBe("agendada");
    expect(w.keys).toEqual([]);
  });

  it("no ar: vai do início até agora", () => {
    const now = new Date("2026-09-03T15:00:00Z");
    const w = campaignWindow(STARTS, ENDS, now, TZ);
    expect(w.status).toBe("no_ar");
    expect(w.from).toEqual(STARTS);
    expect(w.to).toEqual(now);
    expect(w.keys).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
  });

  it("encerrada: vai do início ao fim do contrato", () => {
    const w = campaignWindow(STARTS, ENDS, new Date("2026-10-05T12:00:00Z"), TZ);
    expect(w.status).toBe("encerrada");
    expect(w.to).toEqual(ENDS);
    expect(w.keys).toHaveLength(30);
    expect(w.keys[0]).toBe("2026-09-01");
    expect(w.keys[29]).toBe("2026-09-30");
  });

  // Fim à meia-noite exata é o fim do dia anterior, não um dia a mais.
  it("fim à meia-noite local não ganha um dia a mais", () => {
    const w = campaignWindow(STARTS, new Date("2026-10-01T03:00:00Z"), new Date("2026-10-05T12:00:00Z"), TZ);
    expect(w.keys[w.keys.length - 1]).toBe("2026-09-30");
  });
});
