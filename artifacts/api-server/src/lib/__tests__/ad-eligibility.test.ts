import { describe, expect, it } from "vitest";
import {
  campaignReachesDevice,
  campaignRunsAtTime,
  campaignRunsOnDay,
  canPlayOnDevice,
  countReachedDevices,
  filterEligibleSlides,
  filterReachableSlides,
  minuteOfDay,
  normalizeTimeWindows,
  normalizeWeekdays,
  previewReach,
} from "../ad-eligibility";

const PADARIA = 1;
const FARMACIA = 2;

describe("canPlayOnDevice", () => {
  it("bloqueia anunciante de fora com o mesmo segmento do dono da TV", () => {
    expect(
      canPlayOnDevice({
        advertiserSegmentId: PADARIA,
        advertiserCompanyId: 10,
        deviceCompanyId: 20,
        deviceSegmentId: PADARIA,
      }),
    ).toBe(false);
  });

  it("libera o anunciante na TV da própria empresa mesmo com segmento igual", () => {
    expect(
      canPlayOnDevice({
        advertiserSegmentId: PADARIA,
        advertiserCompanyId: 20,
        deviceCompanyId: 20,
        deviceSegmentId: PADARIA,
      }),
    ).toBe(true);
  });

  it("libera quando os segmentos são diferentes", () => {
    expect(
      canPlayOnDevice({
        advertiserSegmentId: FARMACIA,
        advertiserCompanyId: 10,
        deviceCompanyId: 20,
        deviceSegmentId: PADARIA,
      }),
    ).toBe(true);
  });

  it("libera quando o anunciante não tem segmento", () => {
    expect(
      canPlayOnDevice({
        advertiserSegmentId: null,
        advertiserCompanyId: null,
        deviceCompanyId: 20,
        deviceSegmentId: PADARIA,
      }),
    ).toBe(true);
  });

  it("libera quando o dono da TV não tem segmento", () => {
    expect(
      canPlayOnDevice({
        advertiserSegmentId: PADARIA,
        advertiserCompanyId: 10,
        deviceCompanyId: 20,
        deviceSegmentId: null,
      }),
    ).toBe(true);
  });
});

describe("filterEligibleSlides", () => {
  const device = { id: 7, companyId: 20, segmentId: PADARIA };
  const paraTodos = { targetMode: "all" as const, deviceIds: [], segmentIds: [], weekdays: [] };
  const concorrente = { announcementId: 1, advertiserSegmentId: PADARIA, advertiserCompanyId: 10, ...paraTodos };
  const propria = { announcementId: 2, advertiserSegmentId: PADARIA, advertiserCompanyId: 20, ...paraTodos };
  const outroRamo = { announcementId: 3, advertiserSegmentId: FARMACIA, advertiserCompanyId: 10, ...paraTodos };

  it("tira da lista a peça do concorrente do mesmo segmento", () => {
    const slides = filterEligibleSlides([concorrente, propria, outroRamo], device);
    expect(slides.map((s) => s.announcementId)).toEqual([2, 3]);
  });

  it("mantém a lista intacta quando o dono da TV não tem segmento", () => {
    const slides = filterEligibleSlides([concorrente, propria, outroRamo], { id: 7, companyId: 20, segmentId: null });
    expect(slides).toHaveLength(3);
  });

  it("tira da lista a peça de campanha que não mira esta TV", () => {
    const moinho = {
      announcementId: 4,
      advertiserSegmentId: null,
      advertiserCompanyId: null,
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

  it("tira da lista a peça da campanha fora da faixa de horário", () => {
    // Terça, 12:00 em São Paulo.
    const meioDia = new Date("2026-03-03T15:00:00Z");
    const soDeManha = { ...propria, timeWindows: [{ start: 420, end: 600 }] };
    const almoco = { ...propria, timeWindows: [{ start: 660, end: 780 }] };
    expect(filterEligibleSlides([soDeManha], device, meioDia)).toHaveLength(0);
    expect(filterEligibleSlides([almoco], device, meioDia)).toHaveLength(1);
  });
});

describe("campaignReachesDevice", () => {
  const tvDaPadaria = { id: 7, companyId: 20, segmentId: PADARIA };

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
        advertiserCompanyId: 10,
        deviceCompanyId: tvDaPadaria.companyId,
        deviceSegmentId: tvDaPadaria.segmentId,
      }),
    ).toBe(false);
  });
});

describe("countReachedDevices", () => {
  const tvPadariaA = { id: 1, companyId: 10, segmentId: PADARIA };
  const tvPadariaB = { id: 2, companyId: 20, segmentId: PADARIA };
  const tvFarmacia = { id: 3, companyId: 30, segmentId: FARMACIA };
  const tvSemSegmento = { id: 4, companyId: 40, segmentId: null };
  const rede = [tvPadariaA, tvPadariaB, tvFarmacia, tvSemSegmento];

  const moinho = { advertiserSegmentId: null, advertiserCompanyId: null };

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
    const padariaA = { advertiserSegmentId: PADARIA, advertiserCompanyId: 10 };
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

describe("previewReach", () => {
  const rede = [
    { id: 1, companyId: 20, segmentId: PADARIA }, // TV da própria padaria anunciante
    { id: 2, companyId: 30, segmentId: PADARIA }, // padaria concorrente
    { id: 3, companyId: 40, segmentId: FARMACIA },
    { id: 4, companyId: 50, segmentId: null }, // dono sem segmento
  ];
  const padaria = { advertiserSegmentId: PADARIA, advertiserCompanyId: 20 };

  it("em todas as TVs, conta tudo menos a concorrente e lista a concorrente", () => {
    expect(previewReach({ targetMode: "all", deviceIds: [], segmentIds: [], ...padaria }, rede)).toEqual({
      reachedCount: 3,
      totalDevices: 4,
      competitorDeviceIds: [2],
    });
  });

  it("lista a concorrente mesmo quando ela não está no alvo", () => {
    const preview = previewReach({ targetMode: "devices", deviceIds: [3], segmentIds: [], ...padaria }, rede);
    expect(preview.reachedCount).toBe(1);
    expect(preview.competitorDeviceIds).toEqual([2]);
  });

  it("mirando o próprio ramo, só alcança a TV da própria empresa", () => {
    const preview = previewReach({ targetMode: "segments", deviceIds: [], segmentIds: [PADARIA], ...padaria }, rede);
    expect(preview.reachedCount).toBe(1);
  });

  it("por segmento, deixa de fora a TV de dono sem segmento", () => {
    const farmacia = { advertiserSegmentId: FARMACIA, advertiserCompanyId: 40 };
    const preview = previewReach({ targetMode: "segments", deviceIds: [], segmentIds: [PADARIA, FARMACIA], ...farmacia }, rede);
    expect(preview.reachedCount).toBe(3);
  });

  it("anunciante sem segmento alcança todo o alvo e não tem concorrente", () => {
    const semSegmento = { advertiserSegmentId: null, advertiserCompanyId: 60 };
    expect(previewReach({ targetMode: "all", deviceIds: [], segmentIds: [], ...semSegmento }, rede)).toEqual({
      reachedCount: 4,
      totalDevices: 4,
      competitorDeviceIds: [],
    });
  });

  it("rede vazia dá zero de zero", () => {
    expect(previewReach({ targetMode: "all", deviceIds: [], segmentIds: [], ...padaria }, [])).toEqual({
      reachedCount: 0,
      totalDevices: 0,
      competitorDeviceIds: [],
    });
  });
});

describe("normalizeTimeWindows", () => {
  it("ordena pelo início", () => {
    expect(normalizeTimeWindows([{ start: 1080, end: 1320 }, { start: 420, end: 600 }])).toEqual([
      { start: 420, end: 600 },
      { start: 1080, end: 1320 },
    ]);
  });

  it("junta faixas que se sobrepõem", () => {
    expect(normalizeTimeWindows([{ start: 420, end: 600 }, { start: 540, end: 720 }])).toEqual([{ start: 420, end: 720 }]);
  });

  it("junta faixas que se encostam", () => {
    expect(normalizeTimeWindows([{ start: 420, end: 600 }, { start: 600, end: 720 }])).toEqual([{ start: 420, end: 720 }]);
  });

  it("faixa contida em outra some", () => {
    expect(normalizeTimeWindows([{ start: 420, end: 720 }, { start: 480, end: 540 }])).toEqual([{ start: 420, end: 720 }]);
  });

  it("dia inteiro vira lista vazia: é o mesmo que sem faixa", () => {
    expect(normalizeTimeWindows([{ start: 0, end: 1440 }])).toEqual([]);
  });

  it("faixas que juntas cobrem o dia viram lista vazia", () => {
    expect(normalizeTimeWindows([{ start: 720, end: 1440 }, { start: 0, end: 720 }])).toEqual([]);
  });

  it("mantém a lista vazia", () => {
    expect(normalizeTimeWindows([])).toEqual([]);
  });

  it("não altera a lista recebida", () => {
    const entrada = [{ start: 540, end: 720 }, { start: 420, end: 600 }];
    normalizeTimeWindows(entrada);
    expect(entrada).toEqual([{ start: 540, end: 720 }, { start: 420, end: 600 }]);
  });
});

describe("minuteOfDay", () => {
  it("conta os minutos no fuso do negócio, não no do UTC", () => {
    // 15:30 UTC = 12:30 em São Paulo.
    expect(minuteOfDay(new Date("2026-03-03T15:30:00Z"))).toBe(750);
  });

  it("meia-noite é zero, não 1440", () => {
    // 03:00 UTC = 00:00 em São Paulo.
    expect(minuteOfDay(new Date("2026-03-04T03:00:00Z"))).toBe(0);
  });
});

describe("campaignRunsAtTime", () => {
  const manha = [{ start: 420, end: 600 }]; // 07:00–10:00
  // Horários de São Paulo (UTC−3).
  const as = (hhmm: string) => new Date(`2026-03-03T${hhmm}:00-03:00`);

  it("roda a qualquer hora quando a lista está vazia", () => {
    expect(campaignRunsAtTime([], as("03:00"))).toBe(true);
  });

  it("ausente vale dia todo (linhas de playlist e painel não têm a coluna)", () => {
    expect(campaignRunsAtTime(undefined, as("03:00"))).toBe(true);
    expect(campaignRunsAtTime(null, as("03:00"))).toBe(true);
  });

  it("roda no minuto em que a faixa começa", () => {
    expect(campaignRunsAtTime(manha, as("07:00"))).toBe(true);
  });

  it("não roda no minuto em que a faixa termina", () => {
    expect(campaignRunsAtTime(manha, as("10:00"))).toBe(false);
    expect(campaignRunsAtTime(manha, as("09:59"))).toBe(true);
  });

  it("roda em qualquer uma das faixas", () => {
    const manhaENoite = [...manha, { start: 1080, end: 1320 }];
    expect(campaignRunsAtTime(manhaENoite, as("19:00"))).toBe(true);
    expect(campaignRunsAtTime(manhaENoite, as("12:00"))).toBe(false);
  });

  it("usa a hora de quem assiste: 22:30 em São Paulo já é o dia seguinte em UTC", () => {
    expect(campaignRunsAtTime([{ start: 1320, end: 1440 }], new Date("2026-03-04T01:30:00Z"))).toBe(true);
  });

  it("meia-noite cai na faixa da madrugada, não na da noite anterior", () => {
    const meiaNoite = new Date("2026-03-04T03:00:00Z");
    expect(campaignRunsAtTime([{ start: 0, end: 120 }], meiaNoite)).toBe(true);
    expect(campaignRunsAtTime([{ start: 1320, end: 1440 }], meiaNoite)).toBe(false);
  });
});

describe("filterReachableSlides", () => {
  const device = { id: 1, companyId: 10, segmentId: 3 };
  const base = { targetMode: "all" as const, deviceIds: [], segmentIds: [], advertiserSegmentId: null, advertiserCompanyId: 99 };

  it("ignora dia e horário: só alvo e concorrência", () => {
    const fora = { ...base, weekdays: [0], timeWindows: [{ start: 0, end: 15 }] };
    expect(filterReachableSlides([fora], device)).toHaveLength(1);
  });

  it("tira o concorrente do mesmo segmento", () => {
    expect(filterReachableSlides([{ ...base, advertiserSegmentId: 3 }], device)).toHaveLength(0);
  });

  it("tira campanha de outra TV", () => {
    expect(filterReachableSlides([{ ...base, targetMode: "devices" as const, deviceIds: [2] }], device)).toHaveLength(0);
  });
});
