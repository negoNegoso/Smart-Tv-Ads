import { and, eq, inArray } from "drizzle-orm";
import { db, devicesTable, clientsTable, companiesTable } from "@workspace/db";
import type { AnnouncementOrientation } from "@workspace/db/orientation";
import type { FeedDevice } from "./device-feed";

/** Valores brutos de devices.orientation que dão cada formato de tela. */
const RAW_ORIENTATIONS: Record<AnnouncementOrientation, string[]> = {
  landscape: ["landscape"],
  portrait: ["portrait_right", "portrait_left"],
};

/**
 * A vitrine que a landing espelha naquele formato de tela. O PATCH garante
 * no máximo uma por formato; se ainda assim houver duas (gravação
 * concorrente), vale a de menor id, para a resposta ser estável.
 */
export async function findShowcaseDevice(
  orientation: AnnouncementOrientation,
): Promise<(FeedDevice & { showcase: true }) | null> {
  const [row] = await db
    .select({
      id: devicesTable.id,
      clientId: devicesTable.clientId,
      companyId: clientsTable.companyId,
      segmentId: companiesTable.segmentId,
      orientation: devicesTable.orientation,
    })
    .from(devicesTable)
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId))
    .where(and(eq(devicesTable.showcase, true), inArray(devicesTable.orientation, RAW_ORIENTATIONS[orientation])))
    .orderBy(devicesTable.id)
    .limit(1);
  return row ? { ...row, showcase: true } : null;
}
