/**
 * Alvo da campanha: em quais TVs ela pode aparecer, antes de qualquer regra de
 * concorrência. Os três modos são exclusivos — a TV entra por um motivo só, e
 * dá para dizer qual.
 */
export type CampaignTarget = {
  targetMode: "all" | "devices" | "segments";
  deviceIds: number[];
  segmentIds: number[];
};

/**
 * Faixa do dia em que a campanha vai ao ar, em minutos desde 00:00 no fuso do
 * negócio. Fim exclusivo: 07:00–10:00 é { start: 420, end: 600 } e não roda
 * às 10:00. 1440 é "24:00". Faixa nunca cruza a meia-noite.
 */
export type TimeWindow = { start: number; end: number };

/**
 * Agenda da campanha.
 *
 * `weekdays`: dias da semana no padrão do `Date.getDay()` (0 = domingo …
 * 6 = sábado). Lista vazia significa "todo dia" — é o que valia antes da
 * recorrência existir, então campanha antiga não muda de comportamento.
 *
 * `timeWindows`: faixas do dia, as mesmas em todos os dias marcados. Vazia ou
 * ausente é "dia todo" — linhas de playlist e de painel não carregam a coluna.
 */
export type CampaignSchedule = { weekdays: number[]; timeWindows?: TimeWindow[] };

/** Fuso do negócio. O dia da semana é o de quem assiste à TV, não o do UTC. */
export const BUSINESS_TIME_ZONE = "America/Sao_Paulo";

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/**
 * Guarda a agenda no formato canônico: sem repetição, em ordem, e a semana
 * cheia vira lista vazia — marcar os sete dias é dizer "todo dia", e as duas
 * formas precisam ser o mesmo dado no banco.
 */
export function normalizeWeekdays(weekdays: number[]): number[] {
  const unique = [...new Set(weekdays)].sort((a, b) => a - b);
  return unique.length === 7 ? [] : unique;
}

/**
 * A campanha roda hoje? Lista vazia roda sempre.
 *
 * O dia sai de `Intl` no fuso do negócio, nunca de `getDay()`: das 21h em
 * diante no Brasil o servidor já está no dia seguinte em UTC, e a campanha de
 * terça sumiria da TV três horas antes da terça acabar.
 */
export function campaignRunsOnDay(
  weekdays: number[],
  now: Date = new Date(),
  timeZone: string = BUSINESS_TIME_ZONE,
): boolean {
  if (weekdays.length === 0) return true;
  const label = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(now);
  const today = WEEKDAY_INDEX[label];
  return today !== undefined && weekdays.includes(today);
}

const MINUTES_IN_DAY = 1440;

/**
 * Guarda as faixas no formato canônico: em ordem, sem sobreposição, e faixas
 * que se encostam viram uma só (07–10 + 10–12 = 07–12). Cobrir o dia inteiro
 * vira lista vazia — mesmo papel do `normalizeWeekdays`: "dia todo" tem uma
 * forma só no banco.
 */
export function normalizeTimeWindows(windows: TimeWindow[]): TimeWindow[] {
  const sorted = [...windows].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: TimeWindow[] = [];
  for (const window of sorted) {
    const last = merged[merged.length - 1];
    if (last && window.start <= last.end) {
      last.end = Math.max(last.end, window.end);
    } else {
      merged.push({ start: window.start, end: window.end });
    }
  }
  const coversWholeDay = merged.length === 1 && merged[0].start === 0 && merged[0].end === MINUTES_IN_DAY;
  return coversWholeDay ? [] : merged;
}

/**
 * Minutos desde 00:00 no fuso do negócio. Sai de `Intl`, nunca de
 * `getHours()`: o servidor roda em UTC, e às 22h de Brasília ele já está às
 * 01h. `hourCycle: "h23"` evita o "24:00" que alguns ICU devolvem à
 * meia-noite; o `% 24` é a segunda garantia.
 */
export function minuteOfDay(now: Date = new Date(), timeZone: string = BUSINESS_TIME_ZONE): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0) % 24;
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

/**
 * A campanha está na faixa agora? Lista vazia (ou ausente) roda o dia todo.
 * Início incluso, fim excluso.
 */
export function campaignRunsAtTime(
  windows: TimeWindow[] | null | undefined,
  now: Date = new Date(),
  timeZone: string = BUSINESS_TIME_ZONE,
): boolean {
  if (!windows || windows.length === 0) return true;
  const minute = minuteOfDay(now, timeZone);
  return windows.some((window) => window.start <= minute && minute < window.end);
}

export function campaignReachesDevice(
  campaign: CampaignTarget,
  device: { id: number; segmentId: number | null },
): boolean {
  switch (campaign.targetMode) {
    case "devices":
      return campaign.deviceIds.includes(device.id);
    case "segments":
      // TV de dono sem segmento fica fora: não dá para afirmar que é do ramo.
      return device.segmentId !== null && campaign.segmentIds.includes(device.segmentId);
    default:
      return true;
  }
}

/**
 * Decide se a peça de um anunciante pode ir ao ar na TV de um cliente.
 *
 * Regra do concorrente: anunciante e dono da TV do mesmo segmento não se
 * misturam — a padaria A não anuncia na TV da padaria B. A exceção é a TV da
 * própria empresa: o perfil de anunciante e o de cliente apontam para a mesma
 * `companies.id`.
 *
 * Sem segmento em qualquer um dos lados, a peça passa.
 */
export function canPlayOnDevice(input: {
  advertiserSegmentId: number | null;
  advertiserCompanyId: number | null;
  deviceCompanyId: number;
  deviceSegmentId: number | null;
}): boolean {
  const { advertiserSegmentId, advertiserCompanyId, deviceCompanyId, deviceSegmentId } = input;
  if (advertiserSegmentId === null || deviceSegmentId === null) return true;
  if (advertiserSegmentId !== deviceSegmentId) return true;
  return advertiserCompanyId === deviceCompanyId;
}

/**
 * Só alvo e concorrência, sem dia e sem faixa de horário. É o filtro da lista
 * que a TV guarda para tocar sem internet: ela confere a agenda sozinha.
 */
export function filterReachableSlides<T extends CampaignTarget & AdvertiserIdentity>(
  slides: T[],
  device: NetworkDevice,
): T[] {
  return slides.filter(
    (slide) =>
      campaignReachesDevice(slide, device) &&
      canPlayOnDevice({
        advertiserSegmentId: slide.advertiserSegmentId,
        advertiserCompanyId: slide.advertiserCompanyId,
        deviceCompanyId: device.companyId,
        deviceSegmentId: device.segmentId,
      }),
  );
}

/**
 * Monta a grade da TV: primeiro a agenda (dia e faixa de horário), depois o
 * alvo da campanha (esta TV está na mira?) e a concorrência (o anunciante
 * pode entrar aqui?).
 */
export function filterEligibleSlides<
  T extends CampaignTarget &
    CampaignSchedule & { advertiserSegmentId: number | null; advertiserCompanyId: number | null },
>(
  slides: T[],
  device: { id: number; companyId: number; segmentId: number | null },
  now: Date = new Date(),
): T[] {
  return filterReachableSlides(
    slides.filter((slide) => campaignRunsOnDay(slide.weekdays, now) && campaignRunsAtTime(slide.timeWindows, now)),
    device,
  );
}

export type NetworkDevice = { id: number; companyId: number; segmentId: number | null };
export type AdvertiserIdentity = { advertiserSegmentId: number | null; advertiserCompanyId: number | null };

/**
 * O que a campanha alcança na rede: quantas TVs no alvo podem exibir a peça e
 * em quais TVs o anunciante nunca entra por concorrência — estas olhando a
 * rede inteira, não só o alvo, para o formulário marcar a TV concorrente
 * antes de o admin escolhê-la.
 */
export type ReachPreview = { reachedCount: number; totalDevices: number; competitorDeviceIds: number[] };

export function previewReach(campaign: CampaignTarget & AdvertiserIdentity, devices: NetworkDevice[]): ReachPreview {
  let reachedCount = 0;
  const competitorDeviceIds: number[] = [];
  for (const device of devices) {
    const allowed = canPlayOnDevice({
      advertiserSegmentId: campaign.advertiserSegmentId,
      advertiserCompanyId: campaign.advertiserCompanyId,
      deviceCompanyId: device.companyId,
      deviceSegmentId: device.segmentId,
    });
    if (!allowed) competitorDeviceIds.push(device.id);
    else if (campaignReachesDevice(campaign, device)) reachedCount += 1;
  }
  return { reachedCount, totalDevices: devices.length, competitorDeviceIds };
}

/** Quantas TVs a campanha realmente alcança, já descontada a concorrência. */
export function countReachedDevices(campaign: CampaignTarget & AdvertiserIdentity, devices: NetworkDevice[]): number {
  return previewReach(campaign, devices).reachedCount;
}
