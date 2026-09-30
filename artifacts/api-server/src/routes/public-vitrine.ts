import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, devicesTable, playsTable } from "@workspace/db";
import { deviceOrientationOf } from "@workspace/db/orientation";
import {
  GetVitrineFeedParams,
  GetVitrineFeedResponse,
  RecordVitrinePlaysBody,
  RecordVitrinePlaysResponse,
} from "@workspace/api-zod";
import { findShowcaseDevice, onAirKeys, playKey } from "../lib/vitrine";
import { loadDeviceSlides } from "../lib/device-feed";
import { buildPlayRows } from "../lib/telemetry/record-plays";
import { isBotUserAgent } from "../lib/bot-detect";

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

/**
 * Exibições da vitrine vistas na landing. Contam no relatório do anunciante
 * como as de qualquer TV — decisão do dono do projeto.
 *
 * Por ser pública, a rota só aceita o que um visitante poderia ter visto: a
 * peça tem de estar no feed da vitrine agora, com a mesma campanha. O lote é
 * pequeno (10), o playId deduplica reenvio, e robô (inclusive prévia de link
 * em app de mensagem) não conta. O rate limit por IP fica no Firewall da
 * Vercel, não aqui: função serverless não guarda contador entre instâncias.
 */
router.post("/public/vitrine/plays", async (req, res): Promise<void> => {
  if (isBotUserAgent(req.get("user-agent"))) {
    res.sendStatus(202);
    return;
  }
  const parsed = RecordVitrinePlaysBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const device = await findShowcaseDevice(parsed.data.orientation);
  if (!device) {
    res.status(404).json(SHOWCASE_NOT_FOUND);
    return;
  }

  const allowed = onAirKeys(await loadDeviceSlides(device, req.log));
  const onAir = parsed.data.plays.filter((p) => allowed.has(playKey(p.announcementId, p.campaignId)));
  const offAir = parsed.data.plays.length - onAir.length;

  // Tudo que sobrou está no feed, então peça e campanha existem: os dois
  // conjuntos de "existentes" do buildPlayRows saem do próprio lote.
  const { rows, discarded } = buildPlayRows(
    device.id,
    onAir,
    new Set(onAir.map((p) => p.announcementId)),
    new Set(onAir.flatMap((p) => (p.campaignId != null ? [p.campaignId] : []))),
    new Date(),
  );

  const inserted = rows.length
    ? await db
        .insert(playsTable)
        .values(rows)
        .onConflictDoNothing({ target: [playsTable.deviceId, playsTable.clientPlayId] })
        .returning({ id: playsTable.id })
    : [];

  res.json(
    RecordVitrinePlaysResponse.parse({
      accepted: inserted.length,
      duplicates: rows.length - inserted.length,
      discarded: discarded + offAir,
    }),
  );
});

export default router;
