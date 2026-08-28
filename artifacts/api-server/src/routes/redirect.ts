import { Router, type IRouter } from "express";
import cookieParser from "cookie-parser";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, campaignAnnouncementsTable, scansTable } from "@workspace/db";
import { isBotUserAgent } from "../lib/bot-detect";
import { fingerprintFor } from "../lib/scan-fingerprint";
import { logger } from "../lib/logger";

const VISITOR_COOKIE = "sc_v";
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const router: IRouter = Router();

router.use(cookieParser());

router.get("/:code", async (req, res): Promise<void> => {
  const code = req.params.code;

  const [link] = await db
    .select()
    .from(campaignAnnouncementsTable)
    .where(eq(campaignAnnouncementsTable.scanCode, code));

  if (!link || !link.destinationUrl) {
    res.status(404).send("Código inválido");
    return;
  }

  let visitorId = req.cookies?.[VISITOR_COOKIE] as string | undefined;
  if (!visitorId) {
    visitorId = randomUUID();
    res.cookie(VISITOR_COOKIE, visitorId, {
      maxAge: ONE_YEAR_MS,
      httpOnly: true,
      sameSite: "lax",
    });
  }

  const userAgent = req.get("user-agent") ?? null;
  const ip = req.ip ?? "";

  try {
    await db.insert(scansTable).values({
      campaignAnnouncementId: link.id,
      campaignId: link.campaignId,
      announcementId: link.announcementId,
      visitorId,
      fingerprint: fingerprintFor(ip, userAgent),
      userAgent,
      isBot: isBotUserAgent(userAgent),
    });
  } catch (error) {
    // O redirect do usuário final nunca pode quebrar por falha de registro.
    logger.error({ err: error, code }, "Falha ao registrar scan");
  }

  res.redirect(302, link.destinationUrl);
});

export default router;
