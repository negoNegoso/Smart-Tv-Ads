import { Router } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import announcementsRouter from "./announcements";
import segmentsRouter from "./segments";
import clientsRouter from "./clients";
import devicesRouter from "./devices";
import displayRouter from "./display";
import telemetryRouter from "./telemetry";
import analyticsRouter from "./analytics";
import advertisersRouter from "./advertisers";
import storageRouter from "./storage";
import qrRouter from "./qr";
import usersRouter from "./users";
import portalRouter from "./portal";
import { loadSession, requireAdmin, requireUser } from "../lib/auth/middleware";

const router = Router();

// Públicos
router.use(healthRouter);
router.use(displayRouter);
router.use(telemetryRouter);
router.use(qrRouter);
router.use(storageRouter);

// A partir daqui, resolve identidade (admin ou usuário) para as rotas abaixo.
router.use(loadSession);

// Auth: precisa de loadSession para /auth/me e /auth/change-password.
router.use(authRouter);

// Portais (usuário autenticado; guardas por papel ficam nas rotas do portal).
router.use("/portal", requireUser, portalRouter);

// Gestão: exige admin.
router.use(requireAdmin);
router.use(usersRouter);
router.use(announcementsRouter);
router.use(segmentsRouter);
router.use(clientsRouter);
router.use(devicesRouter);
router.use(analyticsRouter);
router.use(advertisersRouter);

export default router;
