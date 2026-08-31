import { gte, isNotNull, sql } from "drizzle-orm";
import { db, playsTable, devicesTable, clientsTable } from "@workspace/db";

/**
 * Contadores agregados que a landing pública exibe.
 *
 * Só agregados: nenhum nome de cliente, nenhum dado pessoal, nada que
 * identifique um estabelecimento. Esta é a única consulta do sistema que
 * responde sem sessão, então o que sai daqui é público para sempre.
 *
 * As duas janelas ficam em funções puras porque são a regra que erra em
 * silêncio: um número errado aqui não quebra nada, só mente na tela.
 */
export const PLAYS_WINDOW_DAYS = 30;
export const ACTIVE_SCREEN_WINDOW_HOURS = 24;

export function playsSince(now: Date): Date {
  return new Date(now.getTime() - PLAYS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

export function activeSince(now: Date): Date {
  return new Date(now.getTime() - ACTIVE_SCREEN_WINDOW_HOURS * 60 * 60 * 1000);
}

export interface PublicStats {
  plays30d: number;
  activeScreens: number;
  clients: number;
  segments: number;
}

export async function publicStats(now: Date = new Date()): Promise<PublicStats> {
  const [plays] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(playsTable)
    .where(gte(playsTable.createdAt, playsSince(now)));

  // lastSeenAt nulo não satisfaz o gte: device cadastrado que nunca reportou
  // presença não conta como tela ativa.
  const [screens] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(devicesTable)
    .where(gte(devicesTable.lastSeenAt, activeSince(now)));

  const [clients] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(clientsTable);

  const [segments] = await db
    .select({ n: sql<number>`COUNT(DISTINCT ${clientsTable.segmentId})::int` })
    .from(clientsTable)
    .where(isNotNull(clientsTable.segmentId));

  return {
    plays30d: plays?.n ?? 0,
    activeScreens: screens?.n ?? 0,
    clients: clients?.n ?? 0,
    segments: segments?.n ?? 0,
  };
}
