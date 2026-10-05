import { Router, type IRouter } from "express";
import { z } from "zod";
import { previewReach } from "../lib/ad-eligibility";
import { loadAdvertiserIdentity } from "../lib/campaigns/reach";
import { loadNetwork } from "../lib/portal/queries";

const router: IRouter = Router();

const reachInput = z.object({
  advertiserId: z.coerce.number().int().positive(),
  targetMode: z.enum(["all", "devices", "segments"]).default("all"),
  deviceIds: z.array(z.coerce.number().int().positive()).default([]),
  segmentIds: z.array(z.coerce.number().int().positive()).default([]),
});

/**
 * Prévia do formulário de campanha: quantas TVs o alvo alcança e quais são
 * de concorrente, pela mesma conta que decide a grade da TV — o front não
 * reimplementa a regra.
 */
router.post("/campaigns/reach-preview", async (req, res): Promise<void> => {
  const parsed = reachInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos." });
    return;
  }
  const { advertiserId, ...target } = parsed.data;
  const advertiser = await loadAdvertiserIdentity(advertiserId);
  if (!advertiser) {
    res.status(404).json({ error: "Anunciante não encontrado." });
    return;
  }
  const preview = previewReach(
    { ...target, advertiserSegmentId: advertiser.segmentId, advertiserCompanyId: advertiser.companyId },
    await loadNetwork(),
  );
  res.json({
    ...preview,
    advertiserSegmentId: advertiser.segmentId,
    advertiserHasSegment: advertiser.segmentId !== null,
    advertiserCompanyId: advertiser.companyId,
  });
});

export default router;
