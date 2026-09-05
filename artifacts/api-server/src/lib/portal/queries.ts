// artifacts/api-server/src/lib/portal/queries.ts
import { inArray, eq, and, gte, lt, sql } from "drizzle-orm";
import {
  db, campaignsTable, playsTable, scansTable, devicesTable, advertisersTable, clientsTable,
} from "@workspace/db";
import { countReachedDevices } from "../ad-eligibility";
import { onlineSince } from "./overview";
import { portalPeriod, type PortalDays } from "./period";

export interface PortalCampaignRow {
  id: number; name: string; startsAt: Date; endsAt: Date; isActive: boolean;
  deviceCount: number; totalPlays: number; totalScans: number; uniqueVisitors: number;
}

/** Campanhas dos anunciantes vinculados. NUNCA expõe contractValue. */
export async function advertiserCampaigns(advertiserIds: number[], days: PortalDays): Promise<PortalCampaignRow[]> {
  if (advertiserIds.length === 0) return [];
  // A janela entra no ON do join, não no WHERE: no WHERE, uma campanha sem
  // exibição no período viraria linha nenhuma e sumiria da lista, em vez de
  // aparecer zerada — que é a informação que o anunciante precisa ver.
  const period = portalPeriod(days);
  const playsWindow = and(
    gte(playsTable.createdAt, period.from),
    lt(playsTable.createdAt, period.to),
  );
  // Bot também fica fora daqui, e pelo mesmo motivo da janela: no ON, e não
  // no WHERE. Anunciante não paga para ver crawler (mesma regra de
  // overview.ts), e uma campanha cujos únicos scans foram de bot precisa
  // aparecer com zero na lista, não sumir dela.
  const scansWindow = and(
    gte(scansTable.createdAt, period.from),
    lt(scansTable.createdAt, period.to),
    eq(scansTable.isBot, false),
  );
  const rows = await db
    .select({
      id: campaignsTable.id,
      name: campaignsTable.name,
      startsAt: campaignsTable.startsAt,
      endsAt: campaignsTable.endsAt,
      isActive: campaignsTable.isActive,
      targetMode: sql<"all" | "devices" | "segments">`${campaignsTable.targetMode}`,
      deviceIds: sql<number[]>`coalesce((select array_agg(cd.device_id) from campaign_devices cd where cd.campaign_id = ${campaignsTable.id}), array[]::int[])`,
      segmentIds: sql<number[]>`coalesce((select array_agg(cs.segment_id) from campaign_segments cs where cs.campaign_id = ${campaignsTable.id}), array[]::int[])`,
      advertiserSegmentId: advertisersTable.segmentId,
      advertiserClientId: advertisersTable.clientId,
      totalPlays: sql<number>`COUNT(DISTINCT ${playsTable.id})::int`,
      totalScans: sql<number>`COUNT(DISTINCT ${scansTable.id})::int`,
      uniqueVisitors: sql<number>`COUNT(DISTINCT ${scansTable.fingerprint})::int`,
    })
    .from(campaignsTable)
    .innerJoin(advertisersTable, eq(advertisersTable.id, campaignsTable.advertiserId))
    .leftJoin(playsTable, and(eq(playsTable.campaignId, campaignsTable.id), playsWindow))
    .leftJoin(scansTable, and(eq(scansTable.campaignId, campaignsTable.id), scansWindow))
    .where(inArray(campaignsTable.advertiserId, advertiserIds))
    .groupBy(campaignsTable.id, advertisersTable.segmentId, advertisersTable.clientId)
    .orderBy(campaignsTable.startsAt);

  // A cobertura depende do alvo e da regra de concorrência, então é contada
  // sobre a rede inteira — não dá para tirar de `campaign_devices`, que só tem
  // linha no modo "TVs escolhidas".
  const network = await db
    .select({ id: devicesTable.id, clientId: devicesTable.clientId, segmentId: clientsTable.segmentId })
    .from(devicesTable)
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId));

  return rows.map(({ targetMode, deviceIds, segmentIds, advertiserSegmentId, advertiserClientId, ...campaign }) => ({
    ...campaign,
    deviceCount: countReachedDevices(
      { targetMode, deviceIds, segmentIds, advertiserSegmentId, advertiserClientId },
      network,
    ),
  }));
}

export interface PortalDeviceRow {
  id: number; name: string; location: string | null; lastSeenAt: Date | null; totalPlays: number;
  isOnline: boolean;
}

/** Dispositivos dos clientes vinculados. */
export async function clientDevices(clientIds: number[], days: PortalDays): Promise<PortalDeviceRow[]> {
  if (clientIds.length === 0) return [];
  const now = new Date();
  const period = portalPeriod(days, now);
  const playsWindow = and(
    gte(playsTable.createdAt, period.from),
    lt(playsTable.createdAt, period.to),
  );
  // Mesma janela de `onlineSince` usada em clientOverview: se o card de "TVs
  // online agora" e a badge de cada linha vierem de dois relógios diferentes
  // (servidor vs. `Date.now()` do navegador), um cliente com o relógio
  // adiantado ou atrasado vê os dois discordando sobre o mesmo dispositivo.
  const rows = await db
    .select({
      id: devicesTable.id,
      name: devicesTable.name,
      location: devicesTable.location,
      lastSeenAt: devicesTable.lastSeenAt,
      totalPlays: sql<number>`COUNT(${playsTable.id})::int`,
      // COALESCE porque `lastSeenAt IS NULL` faz a comparação virar NULL, e
      // TV que nunca reportou não é "online" nem "não sei" — é offline.
      isOnline: sql<boolean>`COALESCE(${devicesTable.lastSeenAt} >= ${onlineSince(now)}, false)`,
    })
    .from(devicesTable)
    .leftJoin(playsTable, and(eq(playsTable.deviceId, devicesTable.id), playsWindow))
    .where(inArray(devicesTable.clientId, clientIds))
    .groupBy(devicesTable.id)
    .orderBy(devicesTable.name);
  return rows;
}
