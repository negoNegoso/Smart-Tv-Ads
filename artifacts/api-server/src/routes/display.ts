import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, devicesTable, clientsTable } from "@workspace/db";
import { GetDeviceSlidesResponse } from "@workspace/api-zod";
import { loadDeviceSlides } from "../lib/device-feed";

const router: IRouter = Router();

router.get("/display/:deviceKey/slides", async (req, res): Promise<void> => {
  const { deviceKey } = req.params;
  const raw = Array.isArray(deviceKey) ? deviceKey[0] : deviceKey;

  const [device] = await db
    .select({
      id: devicesTable.id,
      clientId: devicesTable.clientId,
      segmentId: clientsTable.segmentId,
    })
    .from(devicesTable)
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .where(eq(devicesTable.deviceKey, raw));

  if (!device) {
    res.status(404).json({ error: "Device not found" });
    return;
  }

  // Update lastSeenAt
  await db
    .update(devicesTable)
    .set({ lastSeenAt: new Date() })
    .where(eq(devicesTable.id, device.id));

  const slides = await loadDeviceSlides(device, req.log);

  // A origem do slide é só para a prévia do admin; a TV não precisa dela.
  res.json(GetDeviceSlidesResponse.parse(slides.map(({ source, ...slide }) => slide)));
});

export default router;
