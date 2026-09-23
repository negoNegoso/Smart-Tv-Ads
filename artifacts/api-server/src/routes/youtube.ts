import { Router, type IRouter } from "express";
import { GetYouTubeMetaQueryParams, GetYouTubeMetaResponse } from "@workspace/api-zod";
import { detectYouTubeMeta } from "../lib/youtube/orientation";

const router: IRouter = Router();

// O formulário da biblioteca pergunta antes de salvar, para o preview já sair
// no formato da peça. Roda no servidor porque o oEmbed não libera CORS.
router.get("/youtube/meta", async (req, res): Promise<void> => {
  const query = GetYouTubeMetaQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const meta = await detectYouTubeMeta(query.data.url);
  if (!meta) {
    res.status(400).json({ error: "Link do YouTube inválido" });
    return;
  }
  res.json(GetYouTubeMetaResponse.parse(meta));
});

export default router;
