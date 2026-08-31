// artifacts/api-server/src/lib/portal/queries.ts
import { inArray, eq, sql } from "drizzle-orm";
import {
  db, campaignsTable, playsTable, scansTable, devicesTable, advertisersTable, clientsTable,
} from "@workspace/db";
import { countReachedDevices } from "../ad-eligibility";

export interface PortalCampaignRow {
  id: number; name: string; startsAt: Date; endsAt: Date; isActive: boolean;
  deviceCount: number; totalPlays: number; totalScans: number; uniqueVisitors: number;
}

/** Campanhas dos anunciantes vinculados. NUNCA expõe contractValue. */
export async function advertiserCampaigns(advertiserIds: number[]): Promise<PortalCampaignRow[]> {
  if (advertiserIds.length === 0) return [];
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
    .leftJoin(playsTable, eq(playsTable.campaignId, campaignsTable.id))
    .leftJoin(scansTable, eq(scansTable.campaignId, campaignsTable.id))
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
}

/** Dispositivos dos clientes vinculados. */
export async function clientDevices(clientIds: number[]): Promise<PortalDeviceRow[]> {
  if (clientIds.length === 0) return [];
  const rows = await db
    .select({
      id: devicesTable.id,
      name: devicesTable.name,
      location: devicesTable.location,
      lastSeenAt: devicesTable.lastSeenAt,
      totalPlays: sql<number>`COUNT(${playsTable.id})::int`,
    })
    .from(devicesTable)
    .leftJoin(playsTable, eq(playsTable.deviceId, devicesTable.id))
    .where(inArray(devicesTable.clientId, clientIds))
    .groupBy(devicesTable.id)
    .orderBy(devicesTable.name);
  return rows;
}
