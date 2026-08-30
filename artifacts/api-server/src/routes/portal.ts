// artifacts/api-server/src/routes/portal.ts
import { Router, type IRouter } from "express";
import { requireAdvertiser, requireClient } from "../lib/auth/middleware";
import { advertiserCampaigns, clientDevices } from "../lib/portal/queries";

const router: IRouter = Router();

router.get("/advertiser/campaigns", requireAdvertiser, async (req, res) => {
  const ids = req.auth?.isAdmin ? [] : (req.auth?.advertiserIds ?? []);
  // Admin visualizando o portal: sem vínculo, retorna vazio (usa o painel admin).
  res.json(await advertiserCampaigns(ids));
});

router.get("/client/devices", requireClient, async (req, res) => {
  const ids = req.auth?.isAdmin ? [] : (req.auth?.clientIds ?? []);
  res.json(await clientDevices(ids));
});

export default router;
