import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  advertisersTable,
  campaignsTable,
  campaignDevicesTable,
  announcementsTable,
  devicesTable,
  impressionsTable,
  campaignAdvertisersTable,
} from "@workspace/db";

const router: IRouter = Router();

const advertiserInput = z.object({
  name: z.string().min(1),
  company: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
});

const campaignInput = z.object({
  advertiserId: z.coerce.number().int().positive().optional(),
  advertiserIds: z.array(z.coerce.number().int().positive()).default([]),
  announcementId: z.coerce.number().int().positive(),
  name: z.string().min(1),
  contractValue: z.coerce.number().min(0).default(0),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  allDevices: z.boolean().default(true),
  deviceIds: z.array(z.coerce.number().int().positive()).default([]),
});

function advertiserIdsFor(input: z.infer<typeof campaignInput>) {
  return [...new Set([...(input.advertiserIds || []), ...(input.advertiserId ? [input.advertiserId] : [])])];
}

async function campaignWithStats(campaignId: number) {
  const [row] = await db
    .select({
      id: campaignsTable.id,
      advertiserId: campaignsTable.advertiserId,
      advertiserName: advertisersTable.name,
      advertiserNames: sql<string[]>`coalesce((select array_agg(a.name order by a.name) from campaign_advertisers ca join advertisers a on a.id = ca.advertiser_id where ca.campaign_id = ${campaignsTable.id}), array[]::text[])`,
      company: advertisersTable.company,
      announcementId: campaignsTable.announcementId,
      announcementTitle: announcementsTable.title,
      name: campaignsTable.name,
      contractValue: campaignsTable.contractValue,
      startsAt: campaignsTable.startsAt,
      endsAt: campaignsTable.endsAt,
      allDevices: campaignsTable.allDevices,
      isActive: campaignsTable.isActive,
      impressions: sql<number>`count(${impressionsTable.id})::int`,
      totalDuration: sql<number>`coalesce(sum(${impressionsTable.durationSeconds}), 0)::int`,
    })
    .from(campaignsTable)
    .innerJoin(advertisersTable, eq(advertisersTable.id, campaignsTable.advertiserId))
    .innerJoin(announcementsTable, eq(announcementsTable.id, campaignsTable.announcementId))
    .leftJoin(
      impressionsTable,
      and(
        eq(impressionsTable.announcementId, campaignsTable.announcementId),
        sql`${impressionsTable.createdAt} >= ${campaignsTable.startsAt}`,
        sql`${impressionsTable.createdAt} <= ${campaignsTable.endsAt}`,
      ),
    )
    .where(eq(campaignsTable.id, campaignId))
    .groupBy(campaignsTable.id, advertisersTable.name, advertisersTable.company, announcementsTable.title);
  if (!row) return null;
  const devices = await db
    .select({ id: devicesTable.id, name: devicesTable.name, location: devicesTable.location })
    .from(campaignDevicesTable)
    .innerJoin(devicesTable, eq(devicesTable.id, campaignDevicesTable.deviceId))
    .where(eq(campaignDevicesTable.campaignId, campaignId));
  return { ...row, devices };
}

router.get("/advertisers", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: advertisersTable.id,
      name: advertisersTable.name,
      company: advertisersTable.company,
      email: advertisersTable.email,
      phone: advertisersTable.phone,
      createdAt: advertisersTable.createdAt,
      campaignCount: sql<number>`count(distinct ${campaignsTable.id})::int`,
      totalImpressions: sql<number>`count(${impressionsTable.id})::int`,
    })
    .from(advertisersTable)
    .leftJoin(campaignAdvertisersTable, eq(campaignAdvertisersTable.advertiserId, advertisersTable.id))
    .leftJoin(campaignsTable, eq(campaignsTable.id, campaignAdvertisersTable.campaignId))
    .leftJoin(impressionsTable, eq(impressionsTable.announcementId, campaignsTable.announcementId))
    .groupBy(advertisersTable.id)
    .orderBy(asc(advertisersTable.name));
  res.json(rows);
});

router.post("/advertisers", async (req, res): Promise<void> => {
  const parsed = advertiserInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(advertisersTable).values({
    ...parsed.data,
    email: parsed.data.email || null,
  }).returning();
  res.status(201).json({ ...row, campaignCount: 0, totalImpressions: 0 });
});

router.get("/advertisers/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [advertiser] = await db.select().from(advertisersTable).where(eq(advertisersTable.id, id));
  if (!advertiser) {
    res.status(404).json({ error: "Advertiser not found" });
    return;
  }
  const campaigns = await db
    .select({
      id: campaignsTable.id,
      advertiserId: campaignsTable.advertiserId,
      advertiserName: advertisersTable.name,
      advertiserNames: sql<string[]>`coalesce((select array_agg(a.name order by a.name) from campaign_advertisers ca join advertisers a on a.id = ca.advertiser_id where ca.campaign_id = ${campaignsTable.id}), array[]::text[])`,
      announcementId: campaignsTable.announcementId,
      announcementTitle: announcementsTable.title,
      name: campaignsTable.name,
      contractValue: campaignsTable.contractValue,
      startsAt: campaignsTable.startsAt,
      endsAt: campaignsTable.endsAt,
      allDevices: campaignsTable.allDevices,
      isActive: campaignsTable.isActive,
      impressions: sql<number>`count(${impressionsTable.id})::int`,
      totalDuration: sql<number>`coalesce(sum(${impressionsTable.durationSeconds}), 0)::int`,
    })
    .from(campaignsTable)
    .innerJoin(advertisersTable, eq(advertisersTable.id, campaignsTable.advertiserId))
    .innerJoin(announcementsTable, eq(announcementsTable.id, campaignsTable.announcementId))
    .leftJoin(impressionsTable, eq(impressionsTable.announcementId, campaignsTable.announcementId))
    .where(sql`exists (select 1 from campaign_advertisers ca where ca.campaign_id = ${campaignsTable.id} and ca.advertiser_id = ${id})`)
    .groupBy(campaignsTable.id, advertisersTable.name, announcementsTable.title)
    .orderBy(desc(campaignsTable.startsAt));
  res.json({ ...advertiser, campaigns });
});

router.patch("/advertisers/:id", async (req, res): Promise<void> => {
  const parsed = advertiserInput.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.update(advertisersTable).set({
    ...parsed.data,
    email: parsed.data.email === "" ? null : parsed.data.email,
  }).where(eq(advertisersTable.id, Number(req.params.id))).returning();
  if (!row) {
    res.status(404).json({ error: "Advertiser not found" });
    return;
  }
  res.json(row);
});

router.delete("/advertisers/:id", async (req, res): Promise<void> => {
  const [row] = await db.delete(advertisersTable).where(eq(advertisersTable.id, Number(req.params.id))).returning();
  if (!row) {
    res.status(404).json({ error: "Advertiser not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/campaigns", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: campaignsTable.id,
      advertiserId: campaignsTable.advertiserId,
      advertiserName: advertisersTable.name,
      announcementId: campaignsTable.announcementId,
      announcementTitle: announcementsTable.title,
      name: campaignsTable.name,
      contractValue: campaignsTable.contractValue,
      startsAt: campaignsTable.startsAt,
      endsAt: campaignsTable.endsAt,
      allDevices: campaignsTable.allDevices,
      isActive: campaignsTable.isActive,
      impressions: sql<number>`count(${impressionsTable.id})::int`,
      totalDuration: sql<number>`coalesce(sum(${impressionsTable.durationSeconds}), 0)::int`,
    })
    .from(campaignsTable)
    .innerJoin(advertisersTable, eq(advertisersTable.id, campaignsTable.advertiserId))
    .innerJoin(announcementsTable, eq(announcementsTable.id, campaignsTable.announcementId))
    .leftJoin(impressionsTable, eq(impressionsTable.announcementId, campaignsTable.announcementId))
    .groupBy(campaignsTable.id, advertisersTable.name, announcementsTable.title)
    .orderBy(desc(campaignsTable.startsAt));
  res.json(rows);
});

router.post("/campaigns", async (req, res): Promise<void> => {
  const parsed = campaignInput.refine((v) => v.endsAt > v.startsAt, { message: "End date must be after start date" }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  const advertiserIds = advertiserIdsFor(input);
  if (advertiserIds.length === 0) {
    res.status(400).json({ error: "Selecione pelo menos um anunciante" });
    return;
  }
  if (!input.allDevices && input.deviceIds.length === 0) {
    res.status(400).json({ error: "Select at least one TV or enable all devices" });
    return;
  }
  const [firstAdvertiser] = await db.select({ id: advertisersTable.id }).from(advertisersTable).where(eq(advertisersTable.id, advertiserIds[0]));
  if (!firstAdvertiser || (await db.select({ id: advertisersTable.id }).from(advertisersTable).where(inArray(advertisersTable.id, advertiserIds))).length !== advertiserIds.length) {
    res.status(400).json({ error: "Um ou mais anunciantes não foram encontrados" });
    return;
  }
  const [campaign] = await db.insert(campaignsTable).values({
    advertiserId: advertiserIds[0],
    announcementId: input.announcementId,
    name: input.name,
    contractValue: input.contractValue,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    allDevices: input.allDevices,
  }).returning();
  await db.insert(campaignAdvertisersTable).values(advertiserIds.map((advertiserId) => ({ campaignId: campaign.id, advertiserId }))).onConflictDoNothing();
  if (!input.allDevices && input.deviceIds.length) {
    await db.insert(campaignDevicesTable).values(
      input.deviceIds.map((deviceId) => ({ campaignId: campaign.id, deviceId })),
    ).onConflictDoNothing();
  }
  res.status(201).json(await campaignWithStats(campaign.id));
});

router.patch("/campaigns/:id/toggle", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  await db.update(campaignsTable).set({ isActive: !existing.isActive }).where(eq(campaignsTable.id, id));
  res.json(await campaignWithStats(id));
});

router.delete("/campaigns/:id", async (req, res): Promise<void> => {
  const [row] = await db.delete(campaignsTable).where(eq(campaignsTable.id, Number(req.params.id))).returning();
  if (!row) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;