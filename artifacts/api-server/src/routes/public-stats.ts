import { Router, type IRouter } from "express";
import { GetPublicStatsResponse } from "@workspace/api-zod";
import { publicStats } from "../lib/public-stats/queries";

const router: IRouter = Router();

/**
 * Números da landing. Rota pública: precisa ficar acima do loadSession em
 * routes/index.ts.
 *
 * O cache é do CDN, não da instância: numa função serverless um cache em
 * memória vive por instância e não ajuda. Se a consulta falhar, o Express 5
 * encaminha a rejeição sozinho e a resposta sai sem Cache-Control — nada de
 * erro cacheado por cinco minutos.
 */
router.get("/public/stats", async (_req, res) => {
  const stats = await publicStats();
  const data = GetPublicStatsResponse.parse(stats);
  res.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  res.json(data);
});

export default router;
