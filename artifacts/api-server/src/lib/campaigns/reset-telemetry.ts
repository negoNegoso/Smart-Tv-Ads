import { eq } from "drizzle-orm";
import { db, campaignsTable, playsTable, scansTable } from "@workspace/db";

export type ResetTelemetryResult = { deletedPlays: number; deletedScans: number };

// Apaga a telemetria de uma campanha (disparos de teste antes dela entrar no ar).
// As métricas da campanha são contagens diretas de plays e scans, então apagar
// as linhas já zera tudo o que o painel mostra. Retorna null se a campanha não
// existe, para a rota devolver 404 em vez de um 200 mentindo que zerou algo.
export async function resetCampaignTelemetry(campaignId: number): Promise<ResetTelemetryResult | null> {
  const [campaign] = await db
    .select({ id: campaignsTable.id })
    .from(campaignsTable)
    .where(eq(campaignsTable.id, campaignId));
  if (!campaign) return null;

  // Uma transação só: um erro no meio não deixa a campanha com plays zerados e
  // scans intactos, o que faria a taxa de scan por exibição virar lixo.
  return db.transaction(async (tx) => {
    const plays = await tx
      .delete(playsTable)
      .where(eq(playsTable.campaignId, campaignId))
      .returning({ id: playsTable.id });
    const scans = await tx
      .delete(scansTable)
      .where(eq(scansTable.campaignId, campaignId))
      .returning({ id: scansTable.id });
    return { deletedPlays: plays.length, deletedScans: scans.length };
  });
}
