import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db, deviceSessionsTable } from "@workspace/db";
import { onlineSince, sessionHistorySince, sessionTimelineSince } from "./device-presence";

/**
 * Sessões de conexão: uma linha por período contínuo em que a TV falou com o
 * servidor. As consultas ficam em funções `build…` separadas para o teste
 * conferir o SQL com `.toSQL()` sem precisar de banco.
 */

/** Estica a sessão em andamento: a que foi vista dentro da janela de presença. */
export function buildStretchSessionQuery(deviceId: number, now: Date) {
  return db
    .update(deviceSessionsTable)
    .set({ lastSeenAt: now })
    .where(and(eq(deviceSessionsTable.deviceId, deviceId), gte(deviceSessionsTable.lastSeenAt, onlineSince(now))))
    .returning({ id: deviceSessionsTable.id });
}

export function buildOpenSessionQuery(deviceId: number, now: Date) {
  return db.insert(deviceSessionsTable).values({ deviceId, startedAt: now, lastSeenAt: now });
}

/** Só as desta TV: a limpeza de uma não pode apagar o histórico de outra. */
export function buildPruneSessionsQuery(deviceId: number, now: Date) {
  return db
    .delete(deviceSessionsTable)
    .where(and(eq(deviceSessionsTable.deviceId, deviceId), lt(deviceSessionsTable.lastSeenAt, sessionHistorySince(now))));
}

export function buildListSessionsQuery(deviceId: number, now: Date) {
  return db
    .select({ startedAt: deviceSessionsTable.startedAt, lastSeenAt: deviceSessionsTable.lastSeenAt })
    .from(deviceSessionsTable)
    .where(and(eq(deviceSessionsTable.deviceId, deviceId), gte(deviceSessionsTable.lastSeenAt, sessionTimelineSince(now))))
    .orderBy(desc(deviceSessionsTable.startedAt));
}

/**
 * Chamado a cada feed da TV. Sessão vista dentro da janela → estica. Nenhuma
 * → a TV voltou depois de uma queda (ou é o primeiro contato): abre outra.
 *
 * A limpeza das sessões velhas pega carona na abertura, que é rara (uma por
 * queda), em vez de um job agendado.
 *
 * Duas requisições simultâneas da mesma key podem abrir duas sessões
 * sobrepostas; a linha do tempo do admin junta as que se sobrepõem.
 */
export async function touchDeviceSession(deviceId: number, now: Date): Promise<void> {
  const stretched = await buildStretchSessionQuery(deviceId, now);
  if (stretched.length > 0) return;
  await buildOpenSessionQuery(deviceId, now);
  await buildPruneSessionsQuery(deviceId, now);
}

export async function listDeviceSessions(
  deviceId: number,
  now: Date,
): Promise<Array<{ startedAt: Date; lastSeenAt: Date }>> {
  return buildListSessionsQuery(deviceId, now);
}
