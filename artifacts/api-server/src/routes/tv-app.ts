import { Router, type IRouter } from "express";
import { latestTvAppRelease, TvAppReleaseUnavailableError } from "../lib/tv-app-release";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const INDISPONIVEL =
  "Não foi possível obter o aplicativo agora. Tente de novo em alguns minutos.";

/** A página /apk mostra a versão que está baixando. */
router.get("/tv-app/latest", async (_req, res): Promise<void> => {
  try {
    const release = await latestTvAppRelease();
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    res.json(release);
  } catch (err) {
    if (err instanceof TvAppReleaseUnavailableError) {
      logger.error({ err }, "update.json indisponível");
      res.status(503).json({ error: INDISPONIVEL });
      return;
    }
    throw err;
  }
});

/** Download em si: o navegador da TV box cai direto no arquivo da release. */
router.get("/tv-app/apk", async (_req, res): Promise<void> => {
  try {
    const release = await latestTvAppRelease();
    // Sem cache no destino: a release muda e o link precisa acompanhar.
    res.setHeader("Cache-Control", "no-store");
    res.redirect(302, release.url);
  } catch (err) {
    if (err instanceof TvAppReleaseUnavailableError) {
      logger.error({ err }, "update.json indisponível");
      res.status(503).type("text/plain; charset=utf-8").send(INDISPONIVEL);
      return;
    }
    throw err;
  }
});

export default router;
