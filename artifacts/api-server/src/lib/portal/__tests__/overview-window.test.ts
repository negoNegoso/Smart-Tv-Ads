import { describe, expect, it } from "vitest";

// overview.ts importa @workspace/db, que lança se DATABASE_URL não existir.
process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";

describe("janela de presença das TVs", () => {
  it("onlineSince olha 5 minutos para trás", async () => {
    const { onlineSince, DEVICE_ONLINE_WINDOW_MINUTES } = await import("../overview");
    expect(DEVICE_ONLINE_WINDOW_MINUTES).toBe(5);
    const now = new Date("2026-09-05T15:00:00.000Z");
    expect(onlineSince(now).toISOString()).toBe("2026-09-05T14:55:00.000Z");
  });
});
