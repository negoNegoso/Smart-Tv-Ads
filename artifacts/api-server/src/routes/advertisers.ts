import { Router, type IRouter } from "express";
import { and, asc, desc, eq, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  advertisersTable,
  campaignsTable,
  campaignDevicesTable,
  announcementsTable,
  devicesTable,
  playsTable,
  campaignAnnouncementsTable,
  segmentsTable,
  clientsTable,
  campaignSegmentsTable,
} from "@workspace/db";
import { generateScanCode } from "@workspace/db/scan-code";
import { resetCampaignTelemetry } from "../lib/campaigns/reset-telemetry";

const router: IRouter = Router();

const advertiserInput = z.object({
  name: z.string().min(1),
  company: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  // Ramo do anunciante e, quando ele também é dono de TV, o cliente
  // correspondente. Juntos decidem em quais TVs as peças podem entrar.
  segmentId: z.coerce.number().int().positive().nullish(),
  clientId: z.coerce.number().int().positive().nullish(),
});

const campaignInput = z.object({
  advertiserId: z.coerce.number().int().positive(),
  announcementId: z.coerce.number().int().positive().optional(),
  announcementIds: z.array(z.coerce.number().int().positive()).default([]),
  name: z.string().min(1),
  contractValue: z.coerce.number().min(0).default(0),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  // Alvo da campanha. Os três modos são exclusivos: a TV entra por um motivo só.
  targetMode: z.enum(["all", "devices", "segments"]).default("all"),
  deviceIds: z.array(z.coerce.number().int().positive()).default([]),
  segmentIds: z.array(z.coerce.number().int().positive()).default([]),
  announcementDestinations: z
    .record(
      z.string(),
      z
        .string()
        .trim()
        .refine(
          (value) => {
            if (value === "") return true;
            try {
              const url = new URL(value);
              return url.protocol === "http:" || url.protocol === "https:";
            } catch {
              return false;
            }
          },
          { message: "URL de destino inválida: use um endereço http:// ou https://" },
        ),
    )
    .default({}),
});

function validateCampaignTarget(input: z.infer<typeof campaignInput>): string | null {
  if (input.targetMode === "devices" && input.deviceIds.length === 0) {
    return "Escolha pelo menos uma TV";
  }
  if (input.targetMode === "segments" && input.segmentIds.length === 0) {
    return "Escolha pelo menos um segmento";
  }
  return null;
}

/**
 * Grava o alvo da campanha deixando só a lista do modo escolhido preenchida —
 * é o que garante que dá para dizer por que uma TV entrou.
 */
async function syncCampaignTarget(campaignId: number, input: z.infer<typeof campaignInput>) {
  const deviceIds = input.targetMode === "devices" ? input.deviceIds : [];
  const segmentIds = input.targetMode === "segments" ? input.segmentIds : [];

  if (deviceIds.length) {
    await db
      .insert(campaignDevicesTable)
      .values(deviceIds.map((deviceId) => ({ campaignId, deviceId })))
      .onConflictDoNothing();
    await db
      .delete(campaignDevicesTable)
      .where(and(eq(campaignDevicesTable.campaignId, campaignId), notInArray(campaignDevicesTable.deviceId, deviceIds)));
  } else {
    await db.delete(campaignDevicesTable).where(eq(campaignDevicesTable.campaignId, campaignId));
  }

  if (segmentIds.length) {
    await db
      .insert(campaignSegmentsTable)
      .values(segmentIds.map((segmentId) => ({ campaignId, segmentId })))
      .onConflictDoNothing();
    await db
      .delete(campaignSegmentsTable)
      .where(and(eq(campaignSegmentsTable.campaignId, campaignId), notInArray(campaignSegmentsTable.segmentId, segmentIds)));
  } else {
    await db.delete(campaignSegmentsTable).where(eq(campaignSegmentsTable.campaignId, campaignId));
  }
}

function announcementIdsFor(input: z.infer<typeof campaignInput>) {
  return [...new Set([...(input.announcementIds || []), ...(input.announcementId ? [input.announcementId] : [])])];
}

async function syncAnnouncementDestinations(campaignId: number, destinations: Record<string, string>) {
  for (const [announcementId, url] of Object.entries(destinations)) {
    const id = Number(announcementId);
    if (!Number.isInteger(id) || id <= 0) continue;
    await db
      .update(campaignAnnouncementsTable)
      .set({ destinationUrl: url.trim() ? url.trim() : null })
      .where(and(eq(campaignAnnouncementsTable.campaignId, campaignId), eq(campaignAnnouncementsTable.announcementId, id)));
  }
}

const campaignSelection = {
  id: campaignsTable.id,
  advertiserId: campaignsTable.advertiserId,
  advertiserName: advertisersTable.name,
  company: advertisersTable.company,
  deviceIds: sql<number[]>`coalesce((select array_agg(cd.device_id order by cd.device_id) from campaign_devices cd where cd.campaign_id = ${campaignsTable.id}), array[]::int[])`,
  announcementIds: sql<number[]>`coalesce((select array_agg(cn.announcement_id order by cn.announcement_id) from campaign_announcements cn where cn.campaign_id = ${campaignsTable.id}), array[]::int[])`,
  announcementTitles: sql<string[]>`coalesce((select array_agg(an.title order by an.title) from campaign_announcements cn join announcements an on an.id = cn.announcement_id where cn.campaign_id = ${campaignsTable.id}), array[]::text[])`,
  name: campaignsTable.name,
  contractValue: campaignsTable.contractValue,
  startsAt: campaignsTable.startsAt,
  endsAt: campaignsTable.endsAt,
  targetMode: campaignsTable.targetMode,
  segmentIds: sql<number[]>`coalesce((select array_agg(cs.segment_id order by cs.segment_id) from campaign_segments cs where cs.campaign_id = ${campaignsTable.id}), array[]::int[])`,
  segmentNames: sql<string[]>`coalesce((select array_agg(sg.name order by sg.name) from campaign_segments cs join segments sg on sg.id = cs.segment_id where cs.campaign_id = ${campaignsTable.id}), array[]::text[])`,
  allDevices: campaignsTable.allDevices,
  isActive: campaignsTable.isActive,
  plays: sql<number>`(select count(*)::int from plays p where p.campaign_id = ${campaignsTable.id})`,
  totalDuration: sql<number>`(select coalesce(sum(p.duration_seconds), 0)::int from plays p where p.campaign_id = ${campaignsTable.id})`,
  playsByAnnouncement: sql<Array<{ announcementId: number; title: string; plays: number }>>`coalesce((select json_agg(json_build_object('announcementId', an.id, 'title', an.title, 'plays', (select count(*)::int from plays p where p.campaign_id = ${campaignsTable.id} and p.announcement_id = an.id)) order by an.title) from campaign_announcements cn join announcements an on an.id = cn.announcement_id where cn.campaign_id = ${campaignsTable.id}), '[]'::json)`,
  announcementLinks: sql<Array<{ announcementId: number; title: string; imageUrl: string; scanCode: string | null; destinationUrl: string | null; plays: number; scans: number }>>`coalesce((select json_agg(json_build_object(
    'announcementId', an.id,
    'title', an.title,
    'imageUrl', an.image_url,
    'scanCode', cn.scan_code,
    'destinationUrl', cn.destination_url,
    'plays', (select count(*)::int from plays p where p.campaign_id = ${campaignsTable.id} and p.announcement_id = an.id),
    'scans', (select count(*)::int from scans s where s.campaign_id = ${campaignsTable.id} and s.announcement_id = an.id and s.is_bot = false)
  ) order by an.title) from campaign_announcements cn join announcements an on an.id = cn.announcement_id where cn.campaign_id = ${campaignsTable.id}), '[]'::json)`,
  scans: sql<number>`(select count(*)::int from scans s where s.campaign_id = ${campaignsTable.id} and s.is_bot = false)`,
};

async function campaignWithStats(campaignId: number) {
  const [row] = await db
    .select(campaignSelection)
    .from(campaignsTable)
    .innerJoin(advertisersTable, eq(advertisersTable.id, campaignsTable.advertiserId))
    .where(eq(campaignsTable.id, campaignId));
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
      segmentId: advertisersTable.segmentId,
      segmentName: segmentsTable.name,
      clientId: advertisersTable.clientId,
      clientName: clientsTable.name,
      createdAt: advertisersTable.createdAt,
      campaignCount: sql<number>`count(distinct ${campaignsTable.id})::int`,
      totalPlays: sql<number>`count(${playsTable.id})::int`,
    })
    .from(advertisersTable)
    .leftJoin(segmentsTable, eq(segmentsTable.id, advertisersTable.segmentId))
    .leftJoin(clientsTable, eq(clientsTable.id, advertisersTable.clientId))
    .leftJoin(campaignsTable, eq(campaignsTable.advertiserId, advertisersTable.id))
    .leftJoin(playsTable, eq(playsTable.campaignId, campaignsTable.id))
    .groupBy(advertisersTable.id, segmentsTable.name, clientsTable.name)
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
  res.status(201).json({ ...row, campaignCount: 0, totalPlays: 0 });
});

router.get("/advertisers/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [advertiser] = await db.select().from(advertisersTable).where(eq(advertisersTable.id, id));
  if (!advertiser) {
    res.status(404).json({ error: "Advertiser not found" });
    return;
  }
  const campaigns = await db
    .select(campaignSelection)
    .from(campaignsTable)
    .innerJoin(advertisersTable, eq(advertisersTable.id, campaignsTable.advertiserId))
    .where(eq(campaignsTable.advertiserId, id))
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
    .select(campaignSelection)
    .from(campaignsTable)
    .innerJoin(advertisersTable, eq(advertisersTable.id, campaignsTable.advertiserId))
    .orderBy(desc(campaignsTable.startsAt));
  res.json(rows);
});

router.get("/campaigns/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid campaign id" });
    return;
  }
  const campaign = await campaignWithStats(id);
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  res.json(campaign);
});

router.post("/campaigns", async (req, res): Promise<void> => {
  const parsed = campaignInput.refine((v) => v.endsAt > v.startsAt, { message: "End date must be after start date" }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  const announcementIds = announcementIdsFor(input);
  if (announcementIds.length === 0) {
    res.status(400).json({ error: "Selecione pelo menos um anúncio" });
    return;
  }
  const targetError = validateCampaignTarget(input);
  if (targetError) {
    res.status(400).json({ error: targetError });
    return;
  }
  const [advertiser] = await db.select({ id: advertisersTable.id }).from(advertisersTable).where(eq(advertisersTable.id, input.advertiserId));
  if (!advertiser) {
    res.status(400).json({ error: "Anunciante não encontrado" });
    return;
  }
  const [campaign] = await db.insert(campaignsTable).values({
    advertiserId: input.advertiserId,
    name: input.name,
    contractValue: input.contractValue,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    targetMode: input.targetMode,
    allDevices: input.targetMode === "all",
  }).returning();
  await db.insert(campaignAnnouncementsTable).values(
    announcementIds.map((announcementId) => ({ campaignId: campaign.id, announcementId, scanCode: generateScanCode() })),
  ).onConflictDoNothing();
  await syncAnnouncementDestinations(campaign.id, input.announcementDestinations);
  await syncCampaignTarget(campaign.id, input);
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

router.patch("/campaigns/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  const parsed = campaignInput.refine((v) => v.endsAt > v.startsAt, { message: "End date must be after start date" }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  const announcementIds = announcementIdsFor(input);
  if (announcementIds.length === 0) {
    res.status(400).json({ error: "Selecione pelo menos um anúncio" });
    return;
  }
  const targetError = validateCampaignTarget(input);
  if (targetError) {
    res.status(400).json({ error: targetError });
    return;
  }
  const [advertiser] = await db.select({ id: advertisersTable.id }).from(advertisersTable).where(eq(advertisersTable.id, input.advertiserId));
  if (!advertiser) {
    res.status(400).json({ error: "Anunciante não encontrado" });
    return;
  }
  await db.update(campaignsTable).set({
    advertiserId: input.advertiserId,
    name: input.name,
    contractValue: input.contractValue,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    targetMode: input.targetMode,
    allDevices: input.targetMode === "all",
  }).where(eq(campaignsTable.id, id));
  await db.insert(campaignAnnouncementsTable).values(
    announcementIds.map((announcementId) => ({ campaignId: id, announcementId, scanCode: generateScanCode() })),
  ).onConflictDoNothing();
  await db.delete(campaignAnnouncementsTable).where(and(eq(campaignAnnouncementsTable.campaignId, id), notInArray(campaignAnnouncementsTable.announcementId, announcementIds)));
  await syncAnnouncementDestinations(id, input.announcementDestinations);
  await syncCampaignTarget(id, input);
  res.json(await campaignWithStats(id));
});

router.post("/campaigns/:id/reset-telemetry", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid campaign id" });
    return;
  }
  const result = await resetCampaignTelemetry(id);
  if (!result) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  res.json(result);
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
