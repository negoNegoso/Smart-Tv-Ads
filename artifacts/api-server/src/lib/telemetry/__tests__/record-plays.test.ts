import { describe, expect, it } from "vitest";
import { buildPlayRows, MAX_PLAY_AGE_SECONDS } from "../record-plays";

const agora = new Date("2026-09-23T15:00:00.000Z");
const item = (over: Partial<Parameters<typeof buildPlayRows>[1][number]> = {}) => ({
  playId: "abcdefgh0001",
  announcementId: 1,
  campaignId: 10,
  durationSeconds: 77.7,
  ageSeconds: 60,
  ...over,
});

describe("buildPlayRows", () => {
  it("data da exibição = agora do servidor menos a idade", () => {
    const { rows } = buildPlayRows(5, [item()], new Set([1]), new Set([10]), agora);
    expect(rows).toEqual([
      {
        deviceId: 5,
        announcementId: 1,
        campaignId: 10,
        durationSeconds: 77.7,
        clientPlayId: "abcdefgh0001",
        createdAt: new Date("2026-09-23T14:59:00.000Z"),
      },
    ]);
  });

  it("idade acima de 7 dias fica em 7 dias", () => {
    const { rows } = buildPlayRows(5, [item({ ageSeconds: MAX_PLAY_AGE_SECONDS * 3 })], new Set([1]), new Set([10]), agora);
    expect(rows[0].createdAt.getTime()).toBe(agora.getTime() - MAX_PLAY_AGE_SECONDS * 1000);
  });

  it("peça que não existe mais é descartada e o resto do lote segue", () => {
    const { rows, discarded } = buildPlayRows(
      5,
      [item({ playId: "abcdefgh0001", announcementId: 99 }), item({ playId: "abcdefgh0002" })],
      new Set([1]),
      new Set([10]),
      agora,
    );
    expect(discarded).toBe(1);
    expect(rows.map((r) => r.clientPlayId)).toEqual(["abcdefgh0002"]);
  });

  it("campanha que não existe mais grava sem campanha", () => {
    const { rows } = buildPlayRows(5, [item({ campaignId: 77 })], new Set([1]), new Set([10]), agora);
    expect(rows[0].campaignId).toBeNull();
  });

  it("exibição sem campanha continua sem campanha", () => {
    const { rows } = buildPlayRows(5, [item({ campaignId: null })], new Set([1]), new Set(), agora);
    expect(rows[0].campaignId).toBeNull();
  });
});
