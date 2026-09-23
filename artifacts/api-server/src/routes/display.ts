import { Router, type IRouter, type Request } from "express";
import { eq } from "drizzle-orm";
import { db, devicesTable, clientsTable, companiesTable } from "@workspace/db";
import { GetDeviceSlidesResponse, GetDisplayFeedResponse } from "@workspace/api-zod";
import { deviceOrientationOf } from "@workspace/db/orientation";
import { loadDeviceSlides } from "../lib/device-feed";

const router: IRouter = Router();

/**
 * O que as duas rotas da TV fazem igual: acha o device pela key, marca a TV
 * como vista e monta a rotação. Null = key desconhecida (o player abre o
 * pareamento pelo corpo exato do 404).
 */
async function loadForTv(req: Request) {
  const { deviceKey } = req.params;
  const raw = Array.isArray(deviceKey) ? deviceKey[0] : deviceKey;

  const [device] = await db
    .select({
      id: devicesTable.id,
      clientId: devicesTable.clientId,
      companyId: clientsTable.companyId,
      segmentId: companiesTable.segmentId,
      orientation: devicesTable.orientation,
    })
    .from(devicesTable)
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId))
    .where(eq(devicesTable.deviceKey, raw));

  if (!device) return null;

  await db
    .update(devicesTable)
    .set({ lastSeenAt: new Date() })
    .where(eq(devicesTable.id, device.id));

  const slides = await loadDeviceSlides(device, req.log);
  // A origem do slide é só para a prévia do admin; a TV não precisa dela.
  return { device, slides: slides.map(({ source, ...slide }) => slide) };
}

// Mantida para TVs com tv.html antigo em cache: mesma lista, sem o giro.
router.get("/display/:deviceKey/slides", async (req, res): Promise<void> => {
  const tv = await loadForTv(req);
  if (!tv) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  res.json(GetDeviceSlidesResponse.parse(tv.slides));
});

router.get("/display/:deviceKey/feed", async (req, res): Promise<void> => {
  const tv = await loadForTv(req);
  if (!tv) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  res.json(
    GetDisplayFeedResponse.parse({
      screen: { orientation: deviceOrientationOf(tv.device.orientation) },
      slides: tv.slides,
    }),
  );
});

export default router;
