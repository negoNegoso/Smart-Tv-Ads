import { Router, type IRouter, type Request } from "express";
import { eq } from "drizzle-orm";
import { db, devicesTable, clientsTable, companiesTable } from "@workspace/db";
import { GetDeviceSlidesResponse, GetDisplayFeedResponse } from "@workspace/api-zod";
import { deviceOrientationOf } from "@workspace/db/orientation";
import { loadDeviceSlides } from "../lib/device-feed";
import { touchDeviceSession } from "../lib/device-sessions";
import { latestTvAppReleaseForFeed } from "../lib/tv-app-release";
import { appUpdateSignal } from "../lib/tv-app-update";
import { tvAppVersionFromUserAgent } from "../lib/tv-app-version";
import { musicRefFromUrl } from "../lib/youtube/music";

const router: IRouter = Router();

/**
 * O que as duas rotas da TV fazem igual: acha o device pela key, marca a TV
 * como vista (presença, versão do app e sessão de conexão) e monta a rotação. Null = key desconhecida (o player abre o
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
      showcase: devicesTable.showcase,
      musicUrl: devicesTable.musicUrl,
      updateRequestedAt: devicesTable.updateRequestedAt,
    })
    .from(devicesTable)
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId))
    .where(eq(devicesTable.deviceKey, raw));

  if (!device) return null;

  // Um instante só para a TV e para a sessão: a linha do tempo e o "visto por
  // último" têm de contar a mesma história.
  const now = new Date();
  const appVersion = tvAppVersionFromUserAgent(req.get("user-agent"));

  // A versão é a do último contato, mesmo quando é nula: TV que passou a
  // abrir no navegador não pode seguir mostrando a versão antiga do app.
  await db
    .update(devicesTable)
    .set({ lastSeenAt: now, appVersion })
    .where(eq(devicesTable.id, device.id));

  // Histórico é acessório: a TV recebe a rotação mesmo que ele falhe.
  try {
    await touchDeviceSession(device.id, now);
  } catch (err) {
    req.log.error({ err, deviceId: device.id }, "Falha ao registrar a sessão de conexão da TV");
  }

  const slides = await loadDeviceSlides(device, req.log);
  // A origem do slide é só para a prévia do admin; a TV não precisa dela.
  return { device, appVersion, now, slides: slides.map(({ source, ...slide }) => slide) };
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
  // Nunca lança e nunca segura o feed além do teto (lib/tv-app-release.ts).
  const latest = await latestTvAppReleaseForFeed();
  res.json(
    GetDisplayFeedResponse.parse({
      screen: { orientation: deviceOrientationOf(tv.device.orientation) },
      // Fora de `slides`: música não é peça e não conta exibição. Link que o
      // parser não reconhece vira null, e a TV segue só com as peças.
      music: musicRefFromUrl(tv.device.musicUrl),
      // Aviso para o app checar atualização agora: versão nova no ar ou
      // pedido do admin. Só avisa; o app decide o que instalar.
      appUpdate: appUpdateSignal({
        appVersion: tv.appVersion,
        latestVersion: latest?.versionName ?? null,
        updateRequestedAt: tv.device.updateRequestedAt,
        now: tv.now,
      }),
      slides: tv.slides,
    }),
  );
});

export default router;
