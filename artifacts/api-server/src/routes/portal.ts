// artifacts/api-server/src/routes/portal.ts
import { Router, type IRouter, type Request, type Response } from "express";
import { requireAdvertiser, requireClient } from "../lib/auth/middleware";
import { advertiserCampaigns, clientDevices } from "../lib/portal/queries";
import { advertiserOverview, clientOverview } from "../lib/portal/overview";
import { parseDays, type PortalDays } from "../lib/portal/period";

const router: IRouter = Router();

/**
 * Resolve o período pedido ou responde 400.
 *
 * Devolver o erro aqui, antes de qualquer query, é o ponto: `?days=3650` não
 * pode virar uma varredura de dez anos na maior tabela do banco só porque
 * alguém editou a barra de endereços.
 */
function resolvePeriod(req: Request, res: Response): PortalDays | null {
  const days = parseDays(req.query.days);
  if (days === null) {
    res.status(400).json({ error: "Período inválido. Use days=7, 30 ou 90." });
    return null;
  }
  return days;
}

// Admin visualizando o portal: sem vínculo, retorna vazio (usa o painel admin).
const advertiserScope = (req: Request) => (req.auth?.isAdmin ? [] : (req.auth?.advertiserIds ?? []));
const clientScope = (req: Request) => (req.auth?.isAdmin ? [] : (req.auth?.clientIds ?? []));

router.get("/advertiser/campaigns", requireAdvertiser, async (req, res) => {
  const days = resolvePeriod(req, res);
  if (days === null) return;
  res.json(await advertiserCampaigns(advertiserScope(req), days));
});

router.get("/advertiser/overview", requireAdvertiser, async (req, res) => {
  const days = resolvePeriod(req, res);
  if (days === null) return;
  res.json(await advertiserOverview(advertiserScope(req), days));
});

router.get("/client/devices", requireClient, async (req, res) => {
  const days = resolvePeriod(req, res);
  if (days === null) return;
  res.json(await clientDevices(clientScope(req), days));
});

router.get("/client/overview", requireClient, async (req, res) => {
  const days = resolvePeriod(req, res);
  if (days === null) return;
  res.json(await clientOverview(clientScope(req), days));
});

export default router;
