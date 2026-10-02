import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Aqui interessa a decisão (esticar a sessão aberta ou abrir outra), não o
 * SQL — esse é conferido em device-sessions-query.test.ts. O mock reproduz só
 * o encadeamento do drizzle e anota qual operação foi executada.
 */
let executadas: string[] = [];
let esticadas: unknown[] = [];
let linhas: unknown[] = [];
const valuesMock = vi.fn();

function makeChain(result: unknown, nome: string) {
  const chain: Record<string, unknown> = {
    set: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    returning: () => chain,
    values: (v: unknown) => {
      valuesMock(v);
      return chain;
    },
    then: (resolve: (v: unknown) => void, reject?: (r: unknown) => void) => {
      executadas.push(nome);
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return chain;
}

vi.mock("@workspace/db", () => ({
  db: {
    update: () => makeChain(esticadas, "update"),
    insert: () => makeChain(undefined, "insert"),
    delete: () => makeChain(undefined, "delete"),
    select: () => makeChain(linhas, "select"),
  },
  deviceSessionsTable: { id: "id", deviceId: "deviceId", startedAt: "startedAt", lastSeenAt: "lastSeenAt" },
}));

const NOW = new Date("2026-10-02T15:00:00.000Z");

beforeEach(() => {
  executadas = [];
  esticadas = [];
  linhas = [];
  valuesMock.mockReset();
});

describe("touchDeviceSession", () => {
  it("com sessão aberta, só estica: não abre outra nem limpa", async () => {
    esticadas = [{ id: 1 }];
    const { touchDeviceSession } = await import("../device-sessions");
    await touchDeviceSession(7, NOW);
    expect(executadas).toEqual(["update"]);
    expect(valuesMock).not.toHaveBeenCalled();
  });

  it("sem sessão aberta, abre uma nova e limpa as antigas", async () => {
    esticadas = [];
    const { touchDeviceSession } = await import("../device-sessions");
    await touchDeviceSession(7, NOW);
    expect(executadas).toEqual(["update", "insert", "delete"]);
    expect(valuesMock).toHaveBeenCalledWith({ deviceId: 7, startedAt: NOW, lastSeenAt: NOW });
  });
});

describe("listDeviceSessions", () => {
  it("devolve as linhas da consulta", async () => {
    linhas = [{ startedAt: NOW, lastSeenAt: NOW }];
    const { listDeviceSessions } = await import("../device-sessions");
    expect(await listDeviceSessions(7, NOW)).toEqual(linhas);
    expect(executadas).toEqual(["select"]);
  });
});
