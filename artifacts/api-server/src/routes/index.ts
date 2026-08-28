import { Router } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import announcementsRouter from "./announcements";
import clientsRouter from "./clients";
import devicesRouter from "./devices";
import displayRouter from "./display";
import telemetryRouter from "./telemetry";
import analyticsRouter from "./analytics";
import advertisersRouter from "./advertisers";
import storageRouter from "./storage";
import qrRouter from "./qr";
import { requireAdmin } from "../lib/auth/middleware";

const router = Router();

// Públicos: healthcheck, autenticação e o que as TVs/QR consomem.
router.use(healthRouter);
router.use(authRouter);
router.use(displayRouter);
router.use(telemetryRouter);
router.use(qrRouter);
// storageRouter expõe apenas GET /storage/objects/* (leitura pública das
// imagens que as TVs carregam no backend de object storage do Replit).
router.use(storageRouter);

// Porteiro: tudo abaixo exige sessão de admin.
router.use(requireAdmin);

router.use(announcementsRouter);
router.use(clientsRouter);
router.use(devicesRouter);
router.use(analyticsRouter);
router.use(advertisersRouter);

export default router;
