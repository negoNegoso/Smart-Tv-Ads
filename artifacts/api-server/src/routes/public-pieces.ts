import { Router, type IRouter } from "express";
import { GetPublicPiecesResponse } from "@workspace/api-zod";
import { publicPieces } from "../lib/public-pieces/queries";

const router: IRouter = Router();

/**
 * Peças no ar para a TV da landing. Rota pública: precisa ficar acima do
 * loadSession em routes/index.ts.
 *
 * Mesmo cache de CDN de /public/stats, pelo mesmo motivo: função serverless
 * não guarda cache em memória entre instâncias, e erro sai sem Cache-Control.
 */
router.get("/public/pieces", async (_req, res) => {
  const pieces = await publicPieces();
  const data = GetPublicPiecesResponse.parse({ pieces });
  res.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  res.json(data);
});

export default router;
