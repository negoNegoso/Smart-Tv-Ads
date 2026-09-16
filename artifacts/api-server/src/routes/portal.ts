// artifacts/api-server/src/routes/portal.ts
import { Router, type IRouter, type Request, type Response } from "express";
import { requireAdvertiser, requireClient } from "../lib/auth/middleware";
import { advertiserCampaigns, clientDevices, clientsOf, previewDevice } from "../lib/portal/queries";
import { loadDeviceSlides } from "../lib/device-feed";
import { advertiserOverview, clientOverview } from "../lib/portal/overview";
import { parseDays, type PortalDays } from "../lib/portal/period";
import panelsRouter from "./panels";

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

// Admin do env (sem usuário no banco) visualizando o portal: sem vínculo,
// retorna vazio (usa o painel admin). Admin do banco é um usuário real, que
// pode ter loja/anunciante vinculado (ex.: dono de loja marcado admin) — para
// esse, o escopo é o vínculo dele mesmo, não vazio.
const advertiserScope = (req: Request) =>
  req.auth?.isAdmin && !req.auth.user ? [] : (req.auth?.advertiserIds ?? []);
const clientScope = (req: Request) =>
  req.auth?.isAdmin && !req.auth.user ? [] : (req.auth?.clientIds ?? []);

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

/**
 * Lojas do usuário logado. Sem período: é cadastro, não métrica.
 *
 * O portal precisa disto para quem opera mais de uma loja escolher onde o
 * painel será criado — o servidor se recusa a adivinhar, e com razão.
 */
router.get("/client/clients", requireClient, async (req, res) => {
  res.json(await clientsOf(clientScope(req)));
});

router.get("/client/devices", requireClient, async (req, res) => {
  const days = resolvePeriod(req, res);
  if (days === null) return;
  res.json(await clientDevices(clientScope(req), days));
});

/**
 * Prévia da TV para o lojista: a mesma rotação que a TV exibe agora, sem os
 * efeitos colaterais da TV. O `:id` vem da barra de endereços — TV de outra
 * loja responde igual a TV inexistente, para não confirmar que ela existe.
 */
router.get("/client/devices/:id/preview", requireClient, async (req, res) => {
  const deviceId = Number(req.params.id);
  if (!Number.isInteger(deviceId) || deviceId <= 0) {
    res.status(400).json({ error: "TV inválida." });
    return;
  }
  const scope = clientScope(req);
  if (scope.length === 0) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  const device = await previewDevice(deviceId);
  if (!device || !scope.includes(device.clientId)) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  res.json(await loadDeviceSlides(device, req.log));
});

router.get("/client/overview", requireClient, async (req, res) => {
  const days = resolvePeriod(req, res);
  if (days === null) return;
  res.json(await clientOverview(clientScope(req), days));
});

router.use(panelsRouter);

export default router;
