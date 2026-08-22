import { Router, type IRouter } from "express";
import { eq, sql, desc } from "drizzle-orm";
import {
  db,
  clientsTable,
  devicesTable,
  impressionsTable,
  announcementsTable,
  devicePlaylistTable,
} from "@workspace/db";
import {
  GetAnalyticsSummaryResponse,
  GetClientAnalyticsParams,
  GetClientAnalyticsResponse,
  GetDeviceAnalyticsParams,
  GetDeviceAnalyticsResponse,
  GetAnnouncementAnalyticsParams,
  GetAnnouncementAnalyticsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

// Overall summary
router.get("/analytics/summary", async (_req, res): Promise<void> => {
  const [counts] = await db
    .select({
      totalClients: sql<number>`(SELECT COUNT(*)::int FROM ${clientsTable})`,
      totalDevices: sql<number>`(SELECT COUNT(*)::int FROM ${devicesTable})`,
      totalImpressions: sql<number>`COUNT(${impressionsTable.id})::int`,
      totalDuration: sql<number>`COALESCE(SUM(${impressionsTable.durationSeconds}), 0)::int`,
    })
    .from(impressionsTable);

  const topAnnouncements = await db
    .select({
      announcementId: impressionsTable.announcementId,
      title: announcementsTable.title,
      impressions: sql<number>`COUNT(${impressionsTable.id})::int`,
      totalDuration: sql<number>`COALESCE(SUM(${impressionsTable.durationSeconds}), 0)::int`,
    })
    .from(impressionsTable)
    .innerJoin(announcementsTable, eq(announcementsTable.id, impressionsTable.announcementId))
    .groupBy(impressionsTable.announcementId, announcementsTable.title)
    .orderBy(desc(sql`COUNT(${impressionsTable.id})`))
    .limit(10);

  res.json(
    GetAnalyticsSummaryResponse.parse({
      totalClients: counts?.totalClients ?? 0,
      totalDevices: counts?.totalDevices ?? 0,
      totalImpressions: counts?.totalImpressions ?? 0,
      totalDuration: counts?.totalDuration ?? 0,
      topAnnouncements,
    })
  );
});

// Client analytics
router.get("/analytics/clients/:clientId", async (req, res): Promise<void> => {
  const params = GetClientAnalyticsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const clientId = params.data.clientId;
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  const [deviceCount] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(devicesTable)
    .where(eq(devicesTable.clientId, clientId));

  const [agg] = await db
    .select({
      totalImpressions: sql<number>`COUNT(${impressionsTable.id})::int`,
      totalDuration: sql<number>`COALESCE(SUM(${impressionsTable.durationSeconds}), 0)::int`,
    })
    .from(impressionsTable)
    .innerJoin(devicesTable, eq(devicesTable.id, impressionsTable.deviceId))
    .where(eq(devicesTable.clientId, clientId));

  const topAnnouncements = await db
    .select({
      announcementId: impressionsTable.announcementId,
      title: announcementsTable.title,
      impressions: sql<number>`COUNT(${impressionsTable.id})::int`,
      totalDuration: sql<number>`COALESCE(SUM(${impressionsTable.durationSeconds}), 0)::int`,
    })
    .from(impressionsTable)
    .innerJoin(devicesTable, eq(devicesTable.id, impressionsTable.deviceId))
    .innerJoin(announcementsTable, eq(announcementsTable.id, impressionsTable.announcementId))
    .where(eq(devicesTable.clientId, clientId))
    .groupBy(impressionsTable.announcementId, announcementsTable.title)
    .orderBy(desc(sql`COUNT(${impressionsTable.id})`))
    .limit(10);

  res.json(
    GetClientAnalyticsResponse.parse({
      clientId,
      clientName: client.name,
      totalDevices: deviceCount?.count ?? 0,
      totalImpressions: agg?.totalImpressions ?? 0,
      totalDuration: agg?.totalDuration ?? 0,
      topAnnouncements,
    })
  );
});

// Device analytics
router.get("/analytics/devices/:deviceId", async (req, res): Promise<void> => {
  const params = GetDeviceAnalyticsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const deviceId = params.data.deviceId;
  const [deviceRow] = await db
    .select({ device: devicesTable, clientName: clientsTable.name })
    .from(devicesTable)
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .where(eq(devicesTable.id, deviceId));

  if (!deviceRow) {
    res.status(404).json({ error: "Device not found" });
    return;
  }

  const [agg] = await db
    .select({
      totalImpressions: sql<number>`COUNT(${impressionsTable.id})::int`,
      totalDuration: sql<number>`COALESCE(SUM(${impressionsTable.durationSeconds}), 0)::int`,
    })
    .from(impressionsTable)
    .where(eq(impressionsTable.deviceId, deviceId));

  const byAnnouncement = await db
    .select({
      announcementId: impressionsTable.announcementId,
      title: announcementsTable.title,
      impressions: sql<number>`COUNT(${impressionsTable.id})::int`,
      totalDuration: sql<number>`COALESCE(SUM(${impressionsTable.durationSeconds}), 0)::int`,
    })
    .from(impressionsTable)
    .innerJoin(announcementsTable, eq(announcementsTable.id, impressionsTable.announcementId))
    .where(eq(impressionsTable.deviceId, deviceId))
    .groupBy(impressionsTable.announcementId, announcementsTable.title)
    .orderBy(desc(sql`COUNT(${impressionsTable.id})`));

  res.json(
    GetDeviceAnalyticsResponse.parse({
      deviceId,
      deviceName: deviceRow.device.name,
      clientId: deviceRow.device.clientId,
      clientName: deviceRow.clientName,
      totalImpressions: agg?.totalImpressions ?? 0,
      totalDuration: agg?.totalDuration ?? 0,
      byAnnouncement,
    })
  );
});

// Announcement analytics
router.get("/analytics/announcements/:announcementId", async (req, res): Promise<void> => {
  const params = GetAnnouncementAnalyticsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const announcementId = params.data.announcementId;
  const [announcement] = await db
    .select()
    .from(announcementsTable)
    .where(eq(announcementsTable.id, announcementId));
  if (!announcement) {
    res.status(404).json({ error: "Announcement not found" });
    return;
  }

  const [agg] = await db
    .select({
      totalImpressions: sql<number>`COUNT(${impressionsTable.id})::int`,
      totalDuration: sql<number>`COALESCE(SUM(${impressionsTable.durationSeconds}), 0)::int`,
    })
    .from(impressionsTable)
    .where(eq(impressionsTable.announcementId, announcementId));

  const byDevice = await db
    .select({
      deviceId: devicesTable.id,
      deviceName: devicesTable.name,
      clientName: clientsTable.name,
      impressions: sql<number>`COUNT(${impressionsTable.id})::int`,
      totalDuration: sql<number>`COALESCE(SUM(${impressionsTable.durationSeconds}), 0)::int`,
    })
    .from(impressionsTable)
    .innerJoin(devicesTable, eq(devicesTable.id, impressionsTable.deviceId))
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .where(eq(impressionsTable.announcementId, announcementId))
    .groupBy(devicesTable.id, devicesTable.name, clientsTable.name)
    .orderBy(desc(sql`COUNT(${impressionsTable.id})`));

  res.json(
    GetAnnouncementAnalyticsResponse.parse({
      announcementId,
      title: announcement.title,
      totalImpressions: agg?.totalImpressions ?? 0,
      totalDuration: agg?.totalDuration ?? 0,
      byDevice,
    })
  );
});

export default router;
