import { Router } from "express";
import healthRouter from "./health";
import announcementsRouter from "./announcements";
import clientsRouter from "./clients";
import devicesRouter from "./devices";
import displayRouter from "./display";
import telemetryRouter from "./telemetry";
import analyticsRouter from "./analytics";
import advertisersRouter from "./advertisers";
import storageRouter from "./storage";

const router = Router();

router.use(healthRouter);
router.use(announcementsRouter);
router.use(clientsRouter);
router.use(devicesRouter);
router.use(displayRouter);
router.use(telemetryRouter);
router.use(analyticsRouter);
router.use(advertisersRouter);
router.use(storageRouter);

export default router;
