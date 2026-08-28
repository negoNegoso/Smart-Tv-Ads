import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, campaignAnnouncementsTable, scansTable } from "@workspace/db";
import { isBotUserAgent } from "../lib/bot-detect";
import { fingerprintFor } from "../lib/scan-fingerprint";
import { logger } from "../lib/logger";

const router: IRouter = Router();

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

  const userAgent = req.get("user-agent") ?? null;
  const ip = req.ip ?? "";

  try {
    // A identidade do leitor é o fingerprint, e só ele: é o único valor presente
    // em todas as leituras, inclusive na primeira. Um cookie só existe a partir
    // da segunda visita, então misturar os dois faria a mesma pessoa contar duas
    // vezes — uma pelo fingerprint na primeira leitura, outra pelo cookie nas
    // seguintes. A coluna visitor_id permanece no schema pelas linhas antigas.
    await db.insert(scansTable).values({
      campaignAnnouncementId: link.id,
      campaignId: link.campaignId,
      announcementId: link.announcementId,
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
