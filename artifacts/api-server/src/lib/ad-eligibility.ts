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
 * Remove da grade da TV as peças de anunciantes concorrentes do dono do device.
 */
export function filterEligibleSlides<T extends { advertiserSegmentId: number | null; advertiserClientId: number | null }>(
  slides: T[],
  device: { clientId: number; segmentId: number | null },
): T[] {
  return slides.filter((slide) =>
    canPlayOnDevice({
      advertiserSegmentId: slide.advertiserSegmentId,
      advertiserClientId: slide.advertiserClientId,
      deviceClientId: device.clientId,
      deviceSegmentId: device.segmentId,
    }),
  );
}
