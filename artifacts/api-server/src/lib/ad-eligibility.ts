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
 * Dias da semana em que a campanha vai ao ar, no padrão do `Date.getDay()`:
 * 0 = domingo … 6 = sábado. Lista vazia significa "todo dia" — é o que valia
 * antes da recorrência existir, então campanha antiga não muda de comportamento.
 */
export type CampaignSchedule = { weekdays: number[] };

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
 * misturam — a padaria A não anuncia na TV da padaria B. A exceção é a TV do
 * próprio anunciante (`advertisers.client_id` aponta para o cliente dono).
 *
 * Sem segmento em qualquer um dos lados, a peça passa: o cadastro antigo não
 * tem classificação e não pode sair do ar por causa disso.
 */
export function canPlayOnDevice(input: {
  advertiserSegmentId: number | null;
  advertiserClientId: number | null;
  deviceClientId: number;
  deviceSegmentId: number | null;
}): boolean {
  const { advertiserSegmentId, advertiserClientId, deviceClientId, deviceSegmentId } = input;
  if (advertiserSegmentId === null || deviceSegmentId === null) return true;
  if (advertiserSegmentId !== deviceSegmentId) return true;
  return advertiserClientId === deviceClientId;
}

/**
 * Monta a grade da TV: primeiro o alvo da campanha (esta TV está na mira?),
 * depois a concorrência (o anunciante pode entrar aqui?). Mirar não fura a
 * regra — a padaria que mira "Padaria" segue barrada na TV da concorrente.
 */
export function filterEligibleSlides<
  T extends CampaignTarget &
    CampaignSchedule & { advertiserSegmentId: number | null; advertiserClientId: number | null },
>(
  slides: T[],
  device: { id: number; clientId: number; segmentId: number | null },
  now: Date = new Date(),
): T[] {
  return slides.filter(
    (slide) =>
      campaignRunsOnDay(slide.weekdays, now) &&
      campaignReachesDevice(slide, device) &&
      canPlayOnDevice({
        advertiserSegmentId: slide.advertiserSegmentId,
        advertiserClientId: slide.advertiserClientId,
        deviceClientId: device.clientId,
        deviceSegmentId: device.segmentId,
      }),
  );
}

/**
 * Quantas TVs a campanha realmente alcança: o alvo já descontando as peças que
 * a regra de concorrência barra. É o número honesto para mostrar ao anunciante
 * — contar linhas de `campaign_devices` erra em todo modo que não seja
 * "TVs escolhidas".
 */
export function countReachedDevices(
  campaign: CampaignTarget & { advertiserSegmentId: number | null; advertiserClientId: number | null },
  devices: Array<{ id: number; clientId: number; segmentId: number | null }>,
): number {
  return devices.filter(
    (device) =>
      campaignReachesDevice(campaign, device) &&
      canPlayOnDevice({
        advertiserSegmentId: campaign.advertiserSegmentId,
        advertiserClientId: campaign.advertiserClientId,
        deviceClientId: device.clientId,
        deviceSegmentId: device.segmentId,
      }),
  ).length;
}
