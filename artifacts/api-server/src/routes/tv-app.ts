import { Router, type IRouter, type Response } from "express";
import {
  apkDownloadUrl,
  APK_NAME,
  latestTvAppRelease,
  TvAppReleaseUnavailableError,
} from "../lib/tv-app-release";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const INDISPONIVEL =
  "Não foi possível obter o aplicativo agora. Tente de novo em alguns minutos.";

function indisponivel(res: Response, err: unknown, json: boolean): boolean {
  if (!(err instanceof TvAppReleaseUnavailableError)) return false;
  logger.error({ err }, "update.json indisponível");
  if (json) res.status(503).json({ error: INDISPONIVEL });
  else res.status(503).type("text/plain; charset=utf-8").send(INDISPONIVEL);
  return true;
}

/** A página /apk mostra a versão que está baixando. */
router.get("/tv-app/latest", async (_req, res): Promise<void> => {
  try {
    const { versionName, apk, sha256 } = await latestTvAppRelease();
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    res.json({ versionName, apk, sha256 });
  } catch (err) {
    if (!indisponivel(res, err, true)) throw err;
  }
});

/**
 * O que o app da TV lê para se atualizar (UPDATE_BASE_URL + "update.json"):
 * mesmo conteúdo do update.json da release, que fica num repositório privado.
 */
router.get("/tv-app/update.json", async (_req, res): Promise<void> => {
  try {
    const { versionName, versionCode, apk, sha256 } = await latestTvAppRelease();
    res.setHeader("Cache-Control", "public, s-maxage=60");
    res.json({ versionName, versionCode, apk, sha256 });
  } catch (err) {
    if (!indisponivel(res, err, true)) throw err;
  }
});

/**
 * Manda para o link temporário do APK; sem cache, porque o link expira. Com
 * `pedido`, só se for o APK da última release: um nome antigo vem de um
 * update.json velho, e o app tenta de novo na próxima checagem.
 */
async function redirectToApk(res: Response, pedido?: string): Promise<void> {
  const release = await latestTvAppRelease();
  if (pedido !== undefined && release.apk !== pedido) {
    res.status(404).type("text/plain; charset=utf-8").send("APK fora da última release");
    return;
  }
  const url = await apkDownloadUrl(release);
  res.setHeader("Cache-Control", "no-store");
  res.redirect(302, url);
}

/** Download pela página /apk: o navegador da TV box cai direto no arquivo. */
router.get("/tv-app/apk", async (_req, res): Promise<void> => {
  try {
    await redirectToApk(res);
  } catch (err) {
    if (!indisponivel(res, err, false)) throw err;
  }
});

/** Download pelo atualizador do app (UPDATE_BASE_URL + nome do APK do update.json). */
router.get("/tv-app/:arquivo", async (req, res, next): Promise<void> => {
  const { arquivo } = req.params;
  if (!APK_NAME.test(arquivo)) {
    next();
    return;
  }
  try {
    await redirectToApk(res, arquivo);
  } catch (err) {
    if (!indisponivel(res, err, false)) throw err;
  }
});

export default router;
