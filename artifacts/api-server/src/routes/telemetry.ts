import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, devicesTable, playsTable } from "@workspace/db";
import { RecordPlayBody } from "@workspace/api-zod";

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

export default router;
