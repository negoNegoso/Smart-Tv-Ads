import { Router, type IRouter } from "express";
import { eq, and, sql, desc, inArray, type SQL } from "drizzle-orm";
import {
  db,
  clientsTable,
  devicesTable,
  playsTable,
  announcementsTable,
  devicePlaylistTable,
  scansTable,
  campaignsTable,
  advertisersTable,
} from "@workspace/db";
import {
  GetAnalyticsSummaryResponse,
  GetClientAnalyticsParams,
  GetClientAnalyticsResponse,
  GetDeviceAnalyticsParams,
  GetDeviceAnalyticsResponse,
  GetAnnouncementAnalyticsParams,
  GetAnnouncementAnalyticsResponse,
  GetCampaignAnalyticsParams,
  GetCampaignAnalyticsResponse,
} from "@workspace/api-zod";
import { scanRate } from "../lib/scan-rate";

const router: IRouter = Router();

// Total scans + unique visitors (non-bot only), optionally scoped by a where clause.
// Kept as a single helper so the bot-exclusion rule can't drift between call sites.
// Uniqueness is measured by fingerprint alone: it is the only identifier present on
// every scan, including the first one. Mixing it with a cookie counted the same
// person twice — by fingerprint on the first read, by cookie on the later ones.
async function scanTotals(where?: SQL) {
  const [row] = await db
    .select({
      totalScans: sql<number>`COUNT(*) FILTER (WHERE ${scansTable.isBot} = false)::int`,
      totalUniqueScans: sql<number>`COUNT(DISTINCT ${scansTable.fingerprint}) FILTER (WHERE ${scansTable.isBot} = false)::int`,
    })
    .from(scansTable)
    .where(where);
  return { totalScans: row?.totalScans ?? 0, totalUniqueScans: row?.totalUniqueScans ?? 0 };
}

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

  const scanCounts = await scanTotals();

  const scansByAnnouncement = await db
    .select({
      announcementId: scansTable.announcementId,
      scans: sql<number>`COUNT(*)::int`,
    })
    .from(scansTable)
    .where(eq(scansTable.isBot, false))
    .groupBy(scansTable.announcementId);

  const scansMap = new Map(scansByAnnouncement.map((row) => [row.announcementId, row.scans]));

  res.json(
    GetAnalyticsSummaryResponse.parse({
      totalClients: counts?.totalClients ?? 0,
      totalDevices: counts?.totalDevices ?? 0,
      totalPlays: counts?.totalPlays ?? 0,
      totalDuration: counts?.totalDuration ?? 0,
      totalScans: scanCounts.totalScans,
      totalUniqueScans: scanCounts.totalUniqueScans,
      topAnnouncements: topAnnouncements.map((item) => {
        const scans = scansMap.get(item.announcementId) ?? 0;
        return { ...item, scans, scanRate: scanRate(scans, item.plays) };
      }),
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

  const scanAgg = await scanTotals(eq(scansTable.announcementId, announcementId));

  const playsByCampaign = await db
    .select({
      campaignId: campaignsTable.id,
      campaignName: campaignsTable.name,
      plays: sql<number>`COUNT(${playsTable.id})::int`,
    })
    .from(playsTable)
    .innerJoin(campaignsTable, eq(campaignsTable.id, playsTable.campaignId))
    .where(eq(playsTable.announcementId, announcementId))
    .groupBy(campaignsTable.id, campaignsTable.name);

  const scansByCampaign = await db
    .select({
      campaignId: scansTable.campaignId,
      scans: sql<number>`COUNT(*)::int`,
    })
    .from(scansTable)
    .where(and(eq(scansTable.announcementId, announcementId), eq(scansTable.isBot, false)))
    .groupBy(scansTable.campaignId);

  const scansByCampaignMap = new Map(scansByCampaign.map((row) => [row.campaignId, row.scans]));

  // Union of campaign keys from both sides: a campaign/announcement pair with
  // scans but zero plays would otherwise vanish from byCampaign entirely while
  // still counting toward totalScans — a silent, unexplained mismatch on screen.
  const playsCampaignIds = new Set(playsByCampaign.map((row) => row.campaignId));
  const scanOnlyCampaignIds = [...scansByCampaignMap.keys()].filter(
    (campaignId): campaignId is number => campaignId !== null && !playsCampaignIds.has(campaignId),
  );
  const scanOnlyCampaignNames = scanOnlyCampaignIds.length
    ? await db
        .select({ id: campaignsTable.id, name: campaignsTable.name })
        .from(campaignsTable)
        .where(inArray(campaignsTable.id, scanOnlyCampaignIds))
    : [];
  const scanOnlyCampaignNameMap = new Map(scanOnlyCampaignNames.map((row) => [row.id, row.name]));

  const byCampaign = [
    ...playsByCampaign.map((row) => {
      const scans = scansByCampaignMap.get(row.campaignId) ?? 0;
      return { ...row, scans, scanRate: scanRate(scans, row.plays) };
    }),
    ...scanOnlyCampaignIds
      .filter((campaignId) => scanOnlyCampaignNameMap.has(campaignId))
      .map((campaignId) => {
        const scans = scansByCampaignMap.get(campaignId) ?? 0;
        return {
          campaignId,
          campaignName: scanOnlyCampaignNameMap.get(campaignId)!,
          plays: 0,
          scans,
          scanRate: scanRate(scans, 0),
        };
      }),
  ];

  res.json(
    GetAnnouncementAnalyticsResponse.parse({
      announcementId,
      title: announcement.title,
      totalPlays: agg?.totalPlays ?? 0,
      totalDuration: agg?.totalDuration ?? 0,
      totalScans: scanAgg.totalScans,
      totalUniqueScans: scanAgg.totalUniqueScans,
      scanRate: scanRate(scanAgg.totalScans, agg?.totalPlays ?? 0),
      byCampaign,
      byDevice,
    })
  );
});

// Campaign analytics
router.get("/analytics/campaigns/:campaignId", async (req, res): Promise<void> => {
  const params = GetCampaignAnalyticsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const campaignId = params.data.campaignId;

  const [campaign] = await db
    .select({
      id: campaignsTable.id,
      name: campaignsTable.name,
      advertiserId: campaignsTable.advertiserId,
      advertiserName: advertisersTable.name,
      startsAt: campaignsTable.startsAt,
      endsAt: campaignsTable.endsAt,
    })
    .from(campaignsTable)
    .innerJoin(advertisersTable, eq(advertisersTable.id, campaignsTable.advertiserId))
    .where(eq(campaignsTable.id, campaignId));

  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  const [playAgg] = await db
    .select({
      totalPlays: sql<number>`COUNT(${playsTable.id})::int`,
      totalDuration: sql<number>`COALESCE(SUM(${playsTable.durationSeconds}), 0)::int`,
    })
    .from(playsTable)
    .where(eq(playsTable.campaignId, campaignId));

  const scanAgg = await scanTotals(eq(scansTable.campaignId, campaignId));

  const playsByAnnouncement = await db
    .select({
      announcementId: playsTable.announcementId,
      title: announcementsTable.title,
      plays: sql<number>`COUNT(${playsTable.id})::int`,
      totalDuration: sql<number>`COALESCE(SUM(${playsTable.durationSeconds}), 0)::int`,
    })
    .from(playsTable)
    .innerJoin(announcementsTable, eq(announcementsTable.id, playsTable.announcementId))
    .where(eq(playsTable.campaignId, campaignId))
    .groupBy(playsTable.announcementId, announcementsTable.title)
    .orderBy(desc(sql`COUNT(${playsTable.id})`));

  const scansByAnnouncement = await db
    .select({
      announcementId: scansTable.announcementId,
      scans: sql<number>`COUNT(*)::int`,
    })
    .from(scansTable)
    .where(and(eq(scansTable.campaignId, campaignId), eq(scansTable.isBot, false)))
    .groupBy(scansTable.announcementId);

  const scansMap = new Map(scansByAnnouncement.map((row) => [row.announcementId, row.scans]));

  // Same union logic as byCampaign above: an announcement scanned but never
  // played within this campaign must still show up as a row.
  const playsAnnouncementIds = new Set(playsByAnnouncement.map((row) => row.announcementId));
  const scanOnlyAnnouncementIds = [...scansMap.keys()].filter(
    (id): id is number => id !== null && !playsAnnouncementIds.has(id),
  );
  const scanOnlyAnnouncements = scanOnlyAnnouncementIds.length
    ? await db
        .select({ id: announcementsTable.id, title: announcementsTable.title })
        .from(announcementsTable)
        .where(inArray(announcementsTable.id, scanOnlyAnnouncementIds))
    : [];
  const scanOnlyAnnouncementTitleMap = new Map(scanOnlyAnnouncements.map((row) => [row.id, row.title]));

  const byAnnouncement = [
    ...playsByAnnouncement.map((item) => {
      const scans = scansMap.get(item.announcementId) ?? 0;
      return { ...item, scans, scanRate: scanRate(scans, item.plays) };
    }),
    ...scanOnlyAnnouncementIds
      .filter((id) => scanOnlyAnnouncementTitleMap.has(id))
      .map((announcementId) => {
        const scans = scansMap.get(announcementId) ?? 0;
        return {
          announcementId,
          title: scanOnlyAnnouncementTitleMap.get(announcementId)!,
          plays: 0,
          totalDuration: 0,
          scans,
          scanRate: scanRate(scans, 0),
        };
      }),
  ];

  res.json(
    GetCampaignAnalyticsResponse.parse({
      campaignId,
      campaignName: campaign.name,
      advertiserId: campaign.advertiserId,
      advertiserName: campaign.advertiserName,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      totalPlays: playAgg?.totalPlays ?? 0,
      totalScans: scanAgg.totalScans,
      totalUniqueScans: scanAgg.totalUniqueScans,
      scanRate: scanRate(scanAgg.totalScans, playAgg?.totalPlays ?? 0),
      byAnnouncement,
    })
  );
});

export default router;
