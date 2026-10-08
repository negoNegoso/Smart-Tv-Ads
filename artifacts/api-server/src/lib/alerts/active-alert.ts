import { and, eq, gt, isNull } from "drizzle-orm";
import { db, announcementsTable, urgentAlertsTable } from "@workspace/db";
import { activeAlertFor, alertPieceIdFor, type AlertDevice } from "./alert-eligibility";

export type AlertPiece = { announcementId: number; title: string; imageUrl: string | null; duration: number; endsAt: Date };

/**
 * A peça do aviso que toma esta TV agora, ou null. O banco só corta os
 * encerrados e os vencidos (índice em ends_at); início, alvo e desempate ficam
 * nas regras puras. Lista vazia ou ausente vale "nenhum aviso".
 */
export async function findActiveAlertPiece(
  device: AlertDevice,
  screen: "landscape" | "portrait",
  now: Date,
): Promise<AlertPiece | null> {
  const alerts =
    (await db
      .select()
      .from(urgentAlertsTable)
      .where(and(isNull(urgentAlertsTable.endedAt), gt(urgentAlertsTable.endsAt, now)))) ?? [];
  const alert = activeAlertFor(alerts, device, now);
  if (!alert) return null;
  const announcementId = alertPieceIdFor(alert, screen);
  if (announcementId === null) return null;
  const [piece] =
    (await db
      .select({
        announcementId: announcementsTable.id,
        title: announcementsTable.title,
        imageUrl: announcementsTable.imageUrl,
        duration: announcementsTable.duration,
      })
      .from(announcementsTable)
      .where(eq(announcementsTable.id, announcementId))) ?? [];
  return piece ? { ...piece, endsAt: alert.endsAt } : null;
}
