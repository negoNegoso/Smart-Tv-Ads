import { describe, expect, it } from "vitest";
import {
  campaignReachesDevice,
  campaignRunsOnDay,
  canPlayOnDevice,
  countReachedDevices,
  filterEligibleSlides,
  normalizeWeekdays,
} from "../ad-eligibility";

const PADARIA = 1;
const FARMACIA = 2;

describe("canPlayOnDevice", () => {
  it("bloqueia anunciante de fora com o mesmo segmento do dono da TV", () => {
    expect(
      canPlayOnDevice({
        advertiserSegmentId: PADARIA,
        advertiserClientId: 10,
        deviceClientId: 20,
        deviceSegmentId: PADARIA,
      }),
    ).toBe(false);
  });

  it("libera o anunciante na TV do próprio cliente mesmo com segmento igual", () => {
    expect(
      canPlayOnDevice({
        advertiserSegmentId: PADARIA,
        advertiserClientId: 20,
        deviceClientId: 20,
        deviceSegmentId: PADARIA,
      }),
    ).toBe(true);
  });

  it("libera quando os segmentos são diferentes", () => {
    expect(
      canPlayOnDevice({
        advertiserSegmentId: FARMACIA,
        advertiserClientId: 10,
        deviceClientId: 20,
        deviceSegmentId: PADARIA,
      }),
    ).toBe(true);
  });

  it("libera quando o anunciante não tem segmento", () => {
    expect(
      canPlayOnDevice({
        advertiserSegmentId: null,
        advertiserClientId: null,
        deviceClientId: 20,
        deviceSegmentId: PADARIA,
      }),
    ).toBe(true);
  });

  it("libera quando o dono da TV não tem segmento", () => {
    expect(
      canPlayOnDevice({
        advertiserSegmentId: PADARIA,
        advertiserClientId: 10,
        deviceClientId: 20,
        deviceSegmentId: null,
      }),
    ).toBe(true);
  });
});

describe("filterEligibleSlides", () => {
  const device = { id: 7, clientId: 20, segmentId: PADARIA };
  const paraTodos = { targetMode: "all" as const, deviceIds: [], segmentIds: [], weekdays: [] };
  const concorrente = { announcementId: 1, advertiserSegmentId: PADARIA, advertiserClientId: 10, ...paraTodos };
  const propria = { announcementId: 2, advertiserSegmentId: PADARIA, advertiserClientId: 20, ...paraTodos };
  const outroRamo = { announcementId: 3, advertiserSegmentId: FARMACIA, advertiserClientId: 10, ...paraTodos };

  it("tira da lista a peça do concorrente do mesmo segmento", () => {
    const slides = filterEligibleSlides([concorrente, propria, outroRamo], device);
    expect(slides.map((s) => s.announcementId)).toEqual([2, 3]);
  });

  it("mantém a lista intacta quando o dono da TV não tem segmento", () => {
    const slides = filterEligibleSlides([concorrente, propria, outroRamo], { id: 7, clientId: 20, segmentId: null });
    expect(slides).toHaveLength(3);
  });

  it("tira da lista a peça de campanha que não mira esta TV", () => {
    const moinho = {
      announcementId: 4,
      advertiserSegmentId: null,
      advertiserClientId: null,
      targetMode: "segments" as const,
      deviceIds: [],
      segmentIds: [FARMACIA],
      weekdays: [],
    };
    expect(filterEligibleSlides([moinho], device)).toHaveLength(0);
    expect(filterEligibleSlides([{ ...moinho, segmentIds: [PADARIA] }], device)).toHaveLength(1);
  });

  it("tira da lista a peça da campanha que não roda hoje", () => {
    const quarta = new Date("2026-03-04T15:00:00Z");
    const soTerçaEQuinta = { ...propria, weekdays: [2, 4] };
    expect(filterEligibleSlides([soTerçaEQuinta], device, quarta)).toHaveLength(0);
    expect(filterEligibleSlides([soTerçaEQuinta], device, new Date("2026-03-03T15:00:00Z"))).toHaveLength(1);
  });
});

describe("campaignReachesDevice", () => {
  const tvDaPadaria = { id: 7, clientId: 20, segmentId: PADARIA };

  it("alcança qualquer TV no modo todas", () => {
    expect(
      campaignReachesDevice({ targetMode: "all", deviceIds: [], segmentIds: [] }, tvDaPadaria),
    ).toBe(true);
  });

  it("alcança só as TVs da lista no modo TVs escolhidas", () => {
    const campaign = { targetMode: "devices" as const, deviceIds: [7, 9], segmentIds: [] };
    expect(campaignReachesDevice(campaign, tvDaPadaria)).toBe(true);
    expect(campaignReachesDevice(campaign, { id: 8, segmentId: PADARIA })).toBe(false);
  });

  it("alcança a TV cujo dono está em um dos segmentos mirados", () => {
    const campaign = { targetMode: "segments" as const, deviceIds: [], segmentIds: [PADARIA, FARMACIA] };
    expect(campaignReachesDevice(campaign, tvDaPadaria)).toBe(true);
  });

  it("não alcança a TV de dono de outro segmento", () => {
    const campaign = { targetMode: "segments" as const, deviceIds: [], segmentIds: [FARMACIA] };
    expect(campaignReachesDevice(campaign, tvDaPadaria)).toBe(false);
  });

  it("não alcança a TV de dono sem segmento no modo por segmento", () => {
    const campaign = { targetMode: "segments" as const, deviceIds: [], segmentIds: [PADARIA] };
    expect(campaignReachesDevice(campaign, { id: 7, segmentId: null })).toBe(false);
  });

  it("mirar um segmento não fura a regra de concorrência", () => {
    // Padaria A mira "Padaria": alcança a TV da padaria B, mas a peça não entra.
    const campaign = { targetMode: "segments" as const, deviceIds: [], segmentIds: [PADARIA] };
    expect(campaignReachesDevice(campaign, tvDaPadaria)).toBe(true);
    expect(
      canPlayOnDevice({
        advertiserSegmentId: PADARIA,
        advertiserClientId: 10,
        deviceClientId: tvDaPadaria.clientId,
        deviceSegmentId: tvDaPadaria.segmentId,
      }),
    ).toBe(false);
  });
});

describe("countReachedDevices", () => {
  const tvPadariaA = { id: 1, clientId: 10, segmentId: PADARIA };
  const tvPadariaB = { id: 2, clientId: 20, segmentId: PADARIA };
  const tvFarmacia = { id: 3, clientId: 30, segmentId: FARMACIA };
  const tvSemSegmento = { id: 4, clientId: 40, segmentId: null };
  const rede = [tvPadariaA, tvPadariaB, tvFarmacia, tvSemSegmento];

  const moinho = { advertiserSegmentId: null, advertiserClientId: null };

  it("conta a rede inteira no modo todas", () => {
    expect(
      countReachedDevices({ ...moinho, targetMode: "all", deviceIds: [], segmentIds: [] }, rede),
    ).toBe(4);
  });

  it("conta só as TVs do segmento mirado", () => {
    expect(
      countReachedDevices({ ...moinho, targetMode: "segments", deviceIds: [], segmentIds: [PADARIA] }, rede),
    ).toBe(2);
  });

  it("conta as TVs da lista no modo TVs escolhidas", () => {
    expect(
      countReachedDevices({ ...moinho, targetMode: "devices", deviceIds: [2, 3], segmentIds: [] }, rede),
    ).toBe(2);
  });

  it("desconta a TV onde a peça é barrada por concorrência", () => {
    // Padaria A anunciando para toda a rede: não entra na TV da padaria B.
    const padariaA = { advertiserSegmentId: PADARIA, advertiserClientId: 10 };
    expect(
      countReachedDevices({ ...padariaA, targetMode: "all", deviceIds: [], segmentIds: [] }, rede),
    ).toBe(3);
  });
});

describe("campaignRunsOnDay", () => {
  // Terça, 4 de março de 2026, meio-dia em São Paulo.
  const tercaDeManha = new Date("2026-03-03T15:00:00Z");

  it("roda em qualquer dia quando a lista está vazia", () => {
    expect(campaignRunsOnDay([], tercaDeManha)).toBe(true);
  });

  it("roda no dia marcado", () => {
    expect(campaignRunsOnDay([2, 4], tercaDeManha)).toBe(true);
  });

  it("não roda no dia fora da lista", () => {
    const quarta = new Date("2026-03-04T15:00:00Z");
    expect(campaignRunsOnDay([2, 4], quarta)).toBe(false);
  });

  it("usa o dia no fuso do negócio, não o do UTC", () => {
    // 23h de segunda em São Paulo já é terça em UTC: a campanha de terça
    // não pode entrar no ar antes da meia-noite de quem assiste.
    const segundaTardeEmSaoPaulo = new Date("2026-03-03T02:00:00Z");
    expect(campaignRunsOnDay([2], segundaTardeEmSaoPaulo)).toBe(false);
    expect(campaignRunsOnDay([1], segundaTardeEmSaoPaulo)).toBe(true);
  });
});

describe("normalizeWeekdays", () => {
  it("ordena e tira repetidos", () => {
    expect(normalizeWeekdays([4, 2, 4])).toEqual([2, 4]);
  });

  it("mantém a lista vazia, que significa todo dia", () => {
    expect(normalizeWeekdays([])).toEqual([]);
  });

  it("descarta a semana inteira: sete dias marcados é todo dia", () => {
    expect(normalizeWeekdays([0, 1, 2, 3, 4, 5, 6])).toEqual([]);
  });
});
