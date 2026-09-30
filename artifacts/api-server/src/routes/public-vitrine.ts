import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, devicesTable } from "@workspace/db";
import { deviceOrientationOf } from "@workspace/db/orientation";
import { GetVitrineFeedParams, GetVitrineFeedResponse } from "@workspace/api-zod";
import { findShowcaseDevice } from "../lib/vitrine";
import { loadDeviceSlides } from "../lib/device-feed";

const router: IRouter = Router();

export const SHOWCASE_NOT_FOUND = { error: "Showcase not found" } as const;

/**
 * Rotação da TV vitrine para o player da landing. Pública: fica acima do
 * loadSession em routes/index.ts, e nunca devolve a deviceKey — com ela
 * qualquer um postaria exibição em /telemetry.
 *
 * Cache curto de CDN: segura a carga na função e na API do YouTube quando a
 * landing recebe muita visita. O preço é o lastSeenAt subir no máximo uma vez
 * por minuto por região, o que basta para a vitrine aparecer online. 404 sai
 * sem Cache-Control para a vitrine recém-ligada aparecer logo.
 */
router.get("/public/vitrine/:orientation/feed", async (req, res): Promise<void> => {
  const params = GetVitrineFeedParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const device = await findShowcaseDevice(params.data.orientation);
  if (!device) {
    res.status(404).json(SHOWCASE_NOT_FOUND);
    return;
  }

  await db.update(devicesTable).set({ lastSeenAt: new Date() }).where(eq(devicesTable.id, device.id));

  const slides = await loadDeviceSlides(device, req.log);
  res.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
  res.json(
    GetVitrineFeedResponse.parse({
      screen: { orientation: deviceOrientationOf(device.orientation) },
      // A origem do slide é só para a prévia do admin, como em /display.
      slides: slides.map(({ source, ...slide }) => slide),
    }),
  );
});

export default router;
