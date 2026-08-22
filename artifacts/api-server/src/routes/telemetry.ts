import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, devicesTable, impressionsTable } from "@workspace/db";
import { RecordImpressionBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/telemetry/impression", async (req, res): Promise<void> => {
  const parsed = RecordImpressionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { deviceKey, announcementId, durationSeconds } = parsed.data;

  const [device] = await db
    .select()
    .from(devicesTable)
    .where(eq(devicesTable.deviceKey, deviceKey));

  if (!device) {
    res.status(400).json({ error: "Unknown device key" });
    return;
  }

  await db.insert(impressionsTable).values({
    deviceId: device.id,
    announcementId,
    durationSeconds,
  });

  res.status(201).json({ ok: true });
});

export default router;
