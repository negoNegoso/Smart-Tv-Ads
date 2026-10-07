import { describe, expect, it } from "vitest";
import {
  activeAlertFor,
  alertIsActive,
  alertPieceIdFor,
  alertReachesDevice,
  alertStatus,
} from "../alert-eligibility";

const PADARIA = 5;
const t = (iso: string) => new Date(iso);

function alerta(over: Partial<Parameters<typeof activeAlertFor>[0][number]> = {}) {
  return {
    id: 1,
    targetMode: "all",
    segmentIds: [] as number[],
    companyIds: [] as number[],
    startsAt: t("2026-10-07T14:00:00Z"),
    endsAt: t("2026-10-07T16:00:00Z"),
    endedAt: null as Date | null,
    createdAt: t("2026-10-07T14:00:00Z"),
    ...over,
  };
}

const tvPadaria = { companyId: 10, segmentId: PADARIA };
const tvSemSegmento = { companyId: 20, segmentId: null };
const meioDoAviso = t("2026-10-07T15:00:00Z");

describe("alertReachesDevice", () => {
  it("todas as TVs atinge qualquer TV", () => {
    expect(alertReachesDevice(alerta(), tvSemSegmento)).toBe(true);
  });

  it("por segmento atinge só a TV cuja empresa está no segmento", () => {
    const aviso = alerta({ targetMode: "segments", segmentIds: [PADARIA] });
    expect(alertReachesDevice(aviso, tvPadaria)).toBe(true);
    expect(alertReachesDevice(aviso, { companyId: 11, segmentId: 6 })).toBe(false);
  });

  it("por segmento nunca atinge TV de empresa sem segmento", () => {
    expect(alertReachesDevice(alerta({ targetMode: "segments", segmentIds: [PADARIA] }), tvSemSegmento)).toBe(false);
  });

  it("por empresa atinge só as TVs da empresa", () => {
    const aviso = alerta({ targetMode: "companies", companyIds: [10] });
    expect(alertReachesDevice(aviso, tvPadaria)).toBe(true);
    expect(alertReachesDevice(aviso, tvSemSegmento)).toBe(false);
  });

  it("modo desconhecido não atinge ninguém", () => {
    expect(alertReachesDevice(alerta({ targetMode: "outro" }), tvPadaria)).toBe(false);
  });
});

describe("alertIsActive e alertStatus", () => {
  it("vale do início (incluso) ao fim (excluso)", () => {
    expect(alertIsActive(alerta(), t("2026-10-07T14:00:00Z"))).toBe(true);
    expect(alertIsActive(alerta(), t("2026-10-07T16:00:00Z"))).toBe(false);
    expect(alertIsActive(alerta(), t("2026-10-07T13:59:59Z"))).toBe(false);
  });

  it("encerrado à mão não vale mais", () => {
    expect(alertIsActive(alerta({ endedAt: t("2026-10-07T14:30:00Z") }), meioDoAviso)).toBe(false);
  });

  it("status: no ar, expirado ou encerrado", () => {
    expect(alertStatus(alerta(), meioDoAviso)).toBe("active");
    expect(alertStatus(alerta(), t("2026-10-07T17:00:00Z"))).toBe("expired");
    expect(alertStatus(alerta({ endedAt: t("2026-10-07T14:30:00Z") }), meioDoAviso)).toBe("ended");
  });
});

describe("activeAlertFor", () => {
  it("nenhum aviso ativo para a TV → null", () => {
    expect(activeAlertFor([alerta({ endsAt: t("2026-10-07T14:30:00Z") })], tvPadaria, meioDoAviso)).toBeNull();
    expect(activeAlertFor([], tvPadaria, meioDoAviso)).toBeNull();
  });

  it("ignora aviso que não atinge a TV", () => {
    const outraEmpresa = alerta({ targetMode: "companies", companyIds: [99] });
    expect(activeAlertFor([outraEmpresa], tvPadaria, meioDoAviso)).toBeNull();
  });

  it("com dois ativos vale o mais recente", () => {
    const antigo = alerta({ id: 1, createdAt: t("2026-10-07T14:00:00Z") });
    const novo = alerta({ id: 2, createdAt: t("2026-10-07T14:20:00Z") });
    expect(activeAlertFor([novo, antigo], tvPadaria, meioDoAviso)?.id).toBe(2);
    expect(activeAlertFor([antigo, novo], tvPadaria, meioDoAviso)?.id).toBe(2);
  });

  it("criados no mesmo instante: vale o de maior id", () => {
    expect(activeAlertFor([alerta({ id: 3 }), alerta({ id: 4 })], tvPadaria, meioDoAviso)?.id).toBe(4);
  });
});

describe("alertPieceIdFor", () => {
  const pecas = { landscapeAnnouncementId: 901, portraitAnnouncementId: 902 };

  it("escolhe a arte da orientação da tela", () => {
    expect(alertPieceIdFor(pecas, "landscape")).toBe(901);
    expect(alertPieceIdFor(pecas, "portrait")).toBe(902);
  });

  it("arte apagada → null (a TV segue a volta normal)", () => {
    expect(alertPieceIdFor({ landscapeAnnouncementId: null, portraitAnnouncementId: 902 }, "landscape")).toBeNull();
  });
});
