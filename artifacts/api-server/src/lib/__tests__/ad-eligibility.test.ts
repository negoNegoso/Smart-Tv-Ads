import { describe, expect, it } from "vitest";
import { canPlayOnDevice, filterEligibleSlides } from "../ad-eligibility";

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
  const device = { clientId: 20, segmentId: PADARIA };
  const concorrente = { announcementId: 1, advertiserSegmentId: PADARIA, advertiserClientId: 10 };
  const propria = { announcementId: 2, advertiserSegmentId: PADARIA, advertiserClientId: 20 };
  const outroRamo = { announcementId: 3, advertiserSegmentId: FARMACIA, advertiserClientId: 10 };

  it("tira da lista a peça do concorrente do mesmo segmento", () => {
    const slides = filterEligibleSlides([concorrente, propria, outroRamo], device);
    expect(slides.map((s) => s.announcementId)).toEqual([2, 3]);
  });

  it("mantém a lista intacta quando o dono da TV não tem segmento", () => {
    const slides = filterEligibleSlides([concorrente, propria, outroRamo], { clientId: 20, segmentId: null });
    expect(slides).toHaveLength(3);
  });
});
