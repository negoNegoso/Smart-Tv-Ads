import { describe, expect, it } from "vitest";
import {
  DEVICE_ONLINE_WINDOW_MINUTES,
  SESSION_HISTORY_DAYS,
  SESSION_TIMELINE_DAYS,
  isOnlineAt,
  onlineSince,
  sessionHistorySince,
  sessionTimelineSince,
} from "../device-presence";

const NOW = new Date("2026-10-02T15:00:00.000Z");

describe("janela de presença das TVs", () => {
  it("onlineSince olha 5 minutos para trás", () => {
    expect(DEVICE_ONLINE_WINDOW_MINUTES).toBe(5);
    expect(onlineSince(NOW).toISOString()).toBe("2026-10-02T14:55:00.000Z");
  });

  it("TV vista dentro da janela está online; na borda também", () => {
    expect(isOnlineAt(new Date("2026-10-02T14:59:00.000Z"), NOW)).toBe(true);
    expect(isOnlineAt(new Date("2026-10-02T14:55:00.000Z"), NOW)).toBe(true);
  });

  it("TV vista antes da janela está offline", () => {
    expect(isOnlineAt(new Date("2026-10-02T14:54:59.000Z"), NOW)).toBe(false);
  });

  // TV cadastrada que nunca reportou não é "não sei": é offline.
  it("TV que nunca conectou está offline", () => {
    expect(isOnlineAt(null, NOW)).toBe(false);
  });

  it("o histórico guardado olha 90 dias para trás", () => {
    expect(SESSION_HISTORY_DAYS).toBe(90);
    expect(sessionHistorySince(NOW).toISOString()).toBe("2026-07-04T15:00:00.000Z");
  });

  it("a linha do tempo da TV mostra 30 dias", () => {
    expect(SESSION_TIMELINE_DAYS).toBe(30);
    expect(sessionTimelineSince(NOW).toISOString()).toBe("2026-09-02T15:00:00.000Z");
  });
});
