import { describe, expect, it } from "vitest";
import { UPDATE_REQUEST_TTL_MINUTES, appUpdateSignal, isRecentUpdateRequest } from "../tv-app-update";

const NOW = new Date("2026-10-02T15:00:00.000Z");
const minutosAtras = (min: number) => new Date(NOW.getTime() - min * 60 * 1000);

function sinal(over: Partial<Parameters<typeof appUpdateSignal>[0]> = {}) {
  return appUpdateSignal({
    appVersion: "1.16.0",
    latestVersion: "1.16.0",
    updateRequestedAt: null,
    now: NOW,
    ...over,
  });
}

describe("isRecentUpdateRequest", () => {
  it("pedido vale 15 minutos", () => {
    expect(UPDATE_REQUEST_TTL_MINUTES).toBe(15);
    expect(isRecentUpdateRequest(minutosAtras(1), NOW)).toBe(true);
    expect(isRecentUpdateRequest(minutosAtras(14), NOW)).toBe(true);
    expect(isRecentUpdateRequest(minutosAtras(15), NOW)).toBe(false);
    expect(isRecentUpdateRequest(minutosAtras(16), NOW)).toBe(false);
  });

  it("TV que nunca recebeu pedido", () => {
    expect(isRecentUpdateRequest(null, NOW)).toBe(false);
    expect(isRecentUpdateRequest(undefined, NOW)).toBe(false);
  });

  // Relógio do banco alguns segundos à frente do servidor: o pedido acabou
  // de ser feito, não pode ser descartado como vencido.
  it("pedido alguns segundos no futuro conta como recente", () => {
    expect(isRecentUpdateRequest(new Date(NOW.getTime() + 20_000), NOW)).toBe(true);
  });
});

describe("appUpdateSignal", () => {
  it("TV em dia e sem pedido não recebe sinal", () => {
    expect(sinal()).toBeNull();
  });

  it("TV em versão menor que a última release recebe a versão nova", () => {
    expect(sinal({ appVersion: "1.15.1" })).toEqual({ version: "1.16.0", forcedAt: null });
  });

  it("TV no navegador (sem app) não recebe sinal automático", () => {
    expect(sinal({ appVersion: null })).toBeNull();
  });

  it("build de teste (-rc) não recebe sinal automático", () => {
    expect(sinal({ appVersion: "1.0.1-rc1" })).toBeNull();
  });

  it("sem release conhecida (GitHub fora) não há sinal automático", () => {
    expect(sinal({ appVersion: "1.0.0", latestVersion: null })).toBeNull();
  });

  it("pedido recente do admin vale mesmo com a TV em dia", () => {
    const pedido = minutosAtras(1);
    expect(sinal({ updateRequestedAt: pedido })).toEqual({ version: "1.16.0", forcedAt: pedido });
  });

  it("pedido vencido não cutuca a TV em dia", () => {
    expect(sinal({ updateRequestedAt: minutosAtras(16) })).toBeNull();
  });

  // Pedido vencido não apaga o sinal automático: só deixa de ir o forcedAt.
  it("pedido vencido com TV desatualizada: sinal automático, sem forcedAt", () => {
    expect(sinal({ appVersion: "1.15.1", updateRequestedAt: minutosAtras(16) })).toEqual({
      version: "1.16.0",
      forcedAt: null,
    });
  });

  it("pedido recente com TV desatualizada leva os dois", () => {
    const pedido = minutosAtras(2);
    expect(sinal({ appVersion: "1.15.1", updateRequestedAt: pedido })).toEqual({
      version: "1.16.0",
      forcedAt: pedido,
    });
  });

  // O admin pede justamente quando algo não vai bem: o pedido tem de chegar
  // mesmo que o servidor não consiga dizer qual é a última versão.
  it("pedido recente sem release conhecida vai com versão nula", () => {
    const pedido = minutosAtras(1);
    expect(sinal({ latestVersion: null, updateRequestedAt: pedido })).toEqual({ version: null, forcedAt: pedido });
  });

  it("pedido recente para TV no navegador ainda vai (a página sem ponte ignora)", () => {
    const pedido = minutosAtras(1);
    expect(sinal({ appVersion: null, updateRequestedAt: pedido })).toEqual({ version: "1.16.0", forcedAt: pedido });
  });
});
