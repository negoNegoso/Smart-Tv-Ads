import { Router, type IRouter } from "express";
import { eq, sql, desc } from "drizzle-orm";
import {
  db,
  clientsTable,
  devicesTable,
  playsTable,
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
      totalPlays: sql<number>`COUNT(${playsTable.id})::int`,
      totalDuration: sql<number>`COALESCE(SUM(${playsTable.durationSeconds}), 0)::int`,
    })
    .from(playsTable);

  const topAnnouncements = await db
    .select({
      announcementId: playsTable.announcementId,
      title: announcementsTable.title,
      plays: sql<number>`COUNT(${playsTable.id})::int`,
      totalDuration: sql<number>`COALESCE(SUM(${playsTable.durationSeconds}), 0)::int`,
    })
    .from(playsTable)
    .innerJoin(announcementsTable, eq(announcementsTable.id, playsTable.announcementId))
    .groupBy(playsTable.announcementId, announcementsTable.title)
    .orderBy(desc(sql`COUNT(${playsTable.id})`))
    .limit(10);

  res.json(
    GetAnalyticsSummaryResponse.parse({
      totalClients: counts?.totalClients ?? 0,
      totalDevices: counts?.totalDevices ?? 0,
      totalPlays: counts?.totalPlays ?? 0,
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
      totalPlays: sql<number>`COUNT(${playsTable.id})::int`,
      totalDuration: sql<number>`COALESCE(SUM(${playsTable.durationSeconds}), 0)::int`,
    })
    .from(playsTable)
    .innerJoin(devicesTable, eq(devicesTable.id, playsTable.deviceId))
    .where(eq(devicesTable.clientId, clientId));

  const topAnnouncements = await db
    .select({
      announcementId: playsTable.announcementId,
      title: announcementsTable.title,
      plays: sql<number>`COUNT(${playsTable.id})::int`,
      totalDuration: sql<number>`COALESCE(SUM(${playsTable.durationSeconds}), 0)::int`,
    })
    .from(playsTable)
    .innerJoin(devicesTable, eq(devicesTable.id, playsTable.deviceId))
    .innerJoin(announcementsTable, eq(announcementsTable.id, playsTable.announcementId))
    .where(eq(devicesTable.clientId, clientId))
    .groupBy(playsTable.announcementId, announcementsTable.title)
    .orderBy(desc(sql`COUNT(${playsTable.id})`))
    .limit(10);

  res.json(
    GetClientAnalyticsResponse.parse({
      clientId,
      clientName: client.name,
      totalDevices: deviceCount?.count ?? 0,
      totalPlays: agg?.totalPlays ?? 0,
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
      totalPlays: sql<number>`COUNT(${playsTable.id})::int`,
      totalDuration: sql<number>`COALESCE(SUM(${playsTable.durationSeconds}), 0)::int`,
    })
    .from(playsTable)
    .where(eq(playsTable.deviceId, deviceId));

  const byAnnouncement = await db
    .select({
      announcementId: playsTable.announcementId,
      title: announcementsTable.title,
      plays: sql<number>`COUNT(${playsTable.id})::int`,
      totalDuration: sql<number>`COALESCE(SUM(${playsTable.durationSeconds}), 0)::int`,
    })
    .from(playsTable)
    .innerJoin(announcementsTable, eq(announcementsTable.id, playsTable.announcementId))
    .where(eq(playsTable.deviceId, deviceId))
    .groupBy(playsTable.announcementId, announcementsTable.title)
    .orderBy(desc(sql`COUNT(${playsTable.id})`));

  res.json(
    GetDeviceAnalyticsResponse.parse({
      deviceId,
      deviceName: deviceRow.device.name,
      clientId: deviceRow.device.clientId,
      clientName: deviceRow.clientName,
      totalPlays: agg?.totalPlays ?? 0,
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
      totalPlays: sql<number>`COUNT(${playsTable.id})::int`,
      totalDuration: sql<number>`COALESCE(SUM(${playsTable.durationSeconds}), 0)::int`,
    })
    .from(playsTable)
    .where(eq(playsTable.announcementId, announcementId));

  const byDevice = await db
    .select({
      deviceId: devicesTable.id,
      deviceName: devicesTable.name,
      clientName: clientsTable.name,
      plays: sql<number>`COUNT(${playsTable.id})::int`,
      totalDuration: sql<number>`COALESCE(SUM(${playsTable.durationSeconds}), 0)::int`,
    })
    .from(playsTable)
    .innerJoin(devicesTable, eq(devicesTable.id, playsTable.deviceId))
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .where(eq(playsTable.announcementId, announcementId))
    .groupBy(devicesTable.id, devicesTable.name, clientsTable.name)
    .orderBy(desc(sql`COUNT(${playsTable.id})`));

  res.json(
    GetAnnouncementAnalyticsResponse.parse({
      announcementId,
      title: announcement.title,
      totalPlays: agg?.totalPlays ?? 0,
      totalDuration: agg?.totalDuration ?? 0,
      byDevice,
    })
  );
});

export default router;
