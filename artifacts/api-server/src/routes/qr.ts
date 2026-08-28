import { Router, type IRouter } from "express";
import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { db, campaignAnnouncementsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/qr/:file", async (req, res): Promise<void> => {
  const file = req.params.file;
  if (!file.endsWith(".png")) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const code = file.slice(0, -4);

  const [link] = await db
    .select({ id: campaignAnnouncementsTable.id })
    .from(campaignAnnouncementsTable)
    .where(eq(campaignAnnouncementsTable.scanCode, code));

  if (!link) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
  const target = `${base.replace(/\/$/, "")}/r/${code}`;

  const png = await QRCode.toBuffer(target, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 512,
    color: { dark: "#000000", light: "#FFFFFF" },
  });

  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.send(png);
});

export default router;
