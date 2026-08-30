// artifacts/api-server/src/lib/portal/queries.ts
import { inArray, eq, sql } from "drizzle-orm";
import {
  db, campaignsTable, campaignDevicesTable, playsTable, scansTable, devicesTable,
} from "@workspace/db";

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
      deviceCount: sql<number>`COUNT(DISTINCT ${campaignDevicesTable.deviceId})::int`,
      totalPlays: sql<number>`COUNT(DISTINCT ${playsTable.id})::int`,
      totalScans: sql<number>`COUNT(DISTINCT ${scansTable.id})::int`,
      uniqueVisitors: sql<number>`COUNT(DISTINCT ${scansTable.fingerprint})::int`,
    })
    .from(campaignsTable)
    .leftJoin(campaignDevicesTable, eq(campaignDevicesTable.campaignId, campaignsTable.id))
    .leftJoin(playsTable, eq(playsTable.campaignId, campaignsTable.id))
    .leftJoin(scansTable, eq(scansTable.campaignId, campaignsTable.id))
    .where(inArray(campaignsTable.advertiserId, advertiserIds))
    .groupBy(campaignsTable.id)
    .orderBy(campaignsTable.startsAt);
  return rows;
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
