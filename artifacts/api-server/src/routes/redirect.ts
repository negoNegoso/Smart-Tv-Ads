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

  // visitorId reflects only what the request already had: it's what gets stored,
  // so COALESCE(visitor_id, fingerprint) in aggregates can fall back to the
  // fingerprint when no cookie came in. cookieValue is what we hand back to the
  // client so future requests do carry the cookie — the two must stay distinct.
  const visitorId = req.cookies?.[VISITOR_COOKIE] as string | undefined;
  const cookieValue = visitorId ?? randomUUID();
  if (!visitorId) {
    res.cookie(VISITOR_COOKIE, cookieValue, {
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
      visitorId: visitorId ?? null,
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
