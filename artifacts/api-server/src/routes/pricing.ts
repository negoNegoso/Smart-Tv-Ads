import { Router, type IRouter } from "express";
import { z } from "zod";
import { previewReach } from "../lib/ad-eligibility";
import { loadAdvertiserIdentity } from "../lib/campaigns/reach";
import { loadPricing, loadQuoteNetwork, savePricing } from "../lib/pricing/store";
import { QUOTE_PERIODS, quote, type QuotePeriod } from "../lib/pricing/quote";

/**
 * Tabela de preço e orçamento — só admin (registrado depois de requireAdmin).
 * O preço nunca sai em rota pública: o cliente pede proposta e o admin vê o
 * valor (sub-projetos B e C).
 */
const router: IRouter = Router();

const CENTAVOS_MAX = 100_000_000; // R$ 1 milhão

const centavos = z.number().int("Use valores em centavos inteiros.").min(0, "Valor não pode ser negativo.").max(CENTAVOS_MAX, "Valor acima de R$ 1.000.000.");
const desconto = z.number().int("Desconto em porcentagem inteira.").min(0, "Desconto entre 0% e 90%.").max(90, "Desconto entre 0% e 90%.");

const pricingInput = z.object({
  pricePerTvCents: centavos,
  minMonthlyCents: centavos,
  quarterlyDiscountPct: desconto,
  annualDiscountPct: desconto,
});

const quoteInput = z.object({
  targetMode: z.enum(["all", "devices", "segments"]),
  deviceIds: z.array(z.number().int().positive()).default([]),
  segmentIds: z.array(z.number().int().positive()).default([]),
  advertiserId: z.number().int().positive().optional(),
  loopInsertions: z.number().int().min(1).max(5).default(1),
  period: z.enum(QUOTE_PERIODS as [QuotePeriod, ...QuotePeriod[]]).default("monthly"),
});

function primeiraMensagem(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dados inválidos.";
}

router.get("/pricing", async (_req, res): Promise<void> => {
  res.json(await loadPricing());
});

router.put("/pricing", async (req, res): Promise<void> => {
  const parsed = pricingInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: primeiraMensagem(parsed.error) });
    return;
  }
  res.json(await savePricing(parsed.data));
});

router.post("/quotes/preview", async (req, res): Promise<void> => {
  const parsed = quoteInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos." });
    return;
  }
  const { advertiserId, loopInsertions, period, ...target } = parsed.data;

  const pricing = await loadPricing();
  // Sem preço configurado não há orçamento: quem chama esconde o valor.
  if (!pricing) {
    res.json({ available: false });
    return;
  }

  let identity = { advertiserSegmentId: null as number | null, advertiserCompanyId: null as number | null };
  if (advertiserId !== undefined) {
    const advertiser = await loadAdvertiserIdentity(advertiserId);
    if (!advertiser) {
      res.status(404).json({ error: "Anunciante não encontrado." });
      return;
    }
    identity = { advertiserSegmentId: advertiser.segmentId, advertiserCompanyId: advertiser.companyId };
  }

  // Mesma conta da prévia de alcance do formulário de campanha.
  const reach = previewReach({ ...target, ...identity }, await loadQuoteNetwork());
  res.json({
    available: true,
    reach: { tvs: reach.reachedCount, blockedByCompetitor: reach.competitorDeviceIds.length },
    quote: quote(pricing, { tvs: reach.reachedCount, loopInsertions, period }),
  });
});

export default router;
