/**
 * Transforma o lote que a TV reenviou em linhas de `plays`.
 *
 * A TV manda "há quantos segundos" cada exibição passou, e não a data: um
 * relógio de TV errado (comum em TV box sem bateria) se cancela na subtração
 * que ela faz, e aqui a idade vira data pelo relógio do servidor. O teto de
 * 7 dias é o mesmo da fila na TV — nada mais velho que isso deveria chegar, e
 * um relógio que pulou não pode jogar uma exibição para o mês passado.
 */
export const MAX_PLAY_AGE_SECONDS = 7 * 24 * 60 * 60;

export interface PlayBatchItem {
  playId: string;
  announcementId: number;
  campaignId?: number | null;
  durationSeconds: number;
  ageSeconds: number;
}

export interface PlayRow {
  deviceId: number;
  announcementId: number;
  campaignId: number | null;
  durationSeconds: number;
  clientPlayId: string;
  createdAt: Date;
}

export function buildPlayRows(
  deviceId: number,
  items: PlayBatchItem[],
  existingAnnouncementIds: Set<number>,
  existingCampaignIds: Set<number>,
  now: Date,
): { rows: PlayRow[]; discarded: number } {
  const rows: PlayRow[] = [];
  let discarded = 0;
  for (const item of items) {
    // Peça apagada enquanto a exibição esperava na fila: a FK recusaria o
    // lote inteiro. Descarta só ela.
    if (!existingAnnouncementIds.has(item.announcementId)) {
      discarded += 1;
      continue;
    }
    const campaignId =
      item.campaignId != null && existingCampaignIds.has(item.campaignId) ? item.campaignId : null;
    const age = Math.min(Math.max(item.ageSeconds, 0), MAX_PLAY_AGE_SECONDS);
    rows.push({
      deviceId,
      announcementId: item.announcementId,
      // Campanha apagada: mesmo efeito do ON DELETE SET NULL das linhas que já existiam.
      campaignId,
      durationSeconds: item.durationSeconds,
      clientPlayId: item.playId,
      createdAt: new Date(now.getTime() - age * 1000),
    });
  }
  return { rows, discarded };
}
