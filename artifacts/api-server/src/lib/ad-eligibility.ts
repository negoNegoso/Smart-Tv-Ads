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
  T extends CampaignTarget & { advertiserSegmentId: number | null; advertiserClientId: number | null },
>(slides: T[], device: { id: number; clientId: number; segmentId: number | null }): T[] {
  return slides.filter(
    (slide) =>
      campaignReachesDevice(slide, device) &&
      canPlayOnDevice({
        advertiserSegmentId: slide.advertiserSegmentId,
        advertiserClientId: slide.advertiserClientId,
        deviceClientId: device.clientId,
        deviceSegmentId: device.segmentId,
      }),
  );
}
