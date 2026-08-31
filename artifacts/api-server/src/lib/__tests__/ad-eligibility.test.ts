import { describe, expect, it } from "vitest";
import { campaignReachesDevice, canPlayOnDevice, countReachedDevices, filterEligibleSlides } from "../ad-eligibility";

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
  const paraTodos = { targetMode: "all" as const, deviceIds: [], segmentIds: [] };
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
    };
    expect(filterEligibleSlides([moinho], device)).toHaveLength(0);
    expect(filterEligibleSlides([{ ...moinho, segmentIds: [PADARIA] }], device)).toHaveLength(1);
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
