import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, devicesTable, playsTable, announcementsTable, campaignsTable } from "@workspace/db";
import { RecordPlayBody, RecordPlaysBody, RecordPlaysResponse } from "@workspace/api-zod";
import { buildPlayRows } from "../lib/telemetry/record-plays";

const router: IRouter = Router();

router.post("/telemetry/play", async (req, res): Promise<void> => {
  const parsed = RecordPlayBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { deviceKey, announcementId, campaignId, durationSeconds } = parsed.data;

  const [device] = await db
    .select()
    .from(devicesTable)
    .where(eq(devicesTable.deviceKey, deviceKey));

  if (!device) {
    res.status(400).json({ error: "Unknown device key" });
    return;
  }

  await db.insert(playsTable).values({
    deviceId: device.id,
    announcementId,
    campaignId: campaignId ?? null,
    durationSeconds,
  });

  res.status(201).json({ ok: true });
});

/**
 * Lote da fila de reenvio da TV (tv.html). Cada exibição traz um `playId`
 * gerado na TV: se a resposta se perder e a TV mandar o mesmo lote de novo,
 * o índice único (device, client_play_id) faz o ON CONFLICT ignorar o que já
 * entrou. O endpoint antigo (/telemetry/play) segue para TVs com tv.html em cache.
 */
router.post("/telemetry/plays", async (req, res): Promise<void> => {
  const parsed = RecordPlaysBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { deviceKey, plays } = parsed.data;

  const [device] = await db
    .select({ id: devicesTable.id })
    .from(devicesTable)
    .where(eq(devicesTable.deviceKey, deviceKey));
  // Mesmo corpo do 404 do feed: a TV reconhece e esvazia a fila, que não tem
  // mais dono (TV apagada ou desvinculada).
  if (!device) {
    res.status(404).json({ error: "Device not found" });
    return;
  }

  const announcementIds = [...new Set(plays.map((p) => p.announcementId))];
  const campaignIds = [...new Set(plays.map((p) => p.campaignId).filter((id): id is number => id != null))];
  const announcements = await db
    .select({ id: announcementsTable.id })
    .from(announcementsTable)
    .where(inArray(announcementsTable.id, announcementIds));
  const campaigns = campaignIds.length
    ? await db
        .select({ id: campaignsTable.id })
        .from(campaignsTable)
        .where(inArray(campaignsTable.id, campaignIds))
    : [];

  const { rows, discarded } = buildPlayRows(
    device.id,
    plays,
    new Set(announcements.map((a) => a.id)),
    new Set(campaigns.map((c) => c.id)),
    new Date(),
  );

  const insertedRows = rows.length
    ? await db
        .insert(playsTable)
        .values(rows)
        .onConflictDoNothing({ target: [playsTable.deviceId, playsTable.clientPlayId] })
        .returning({ id: playsTable.id })
    : [];

  res.json(
    RecordPlaysResponse.parse({
      accepted: insertedRows.length,
      duplicates: rows.length - insertedRows.length,
      discarded,
    }),
  );
});

export default router;
