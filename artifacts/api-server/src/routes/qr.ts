import { Router, type IRouter } from "express";
import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { db, campaignAnnouncementsTable } from "@workspace/db";
import { publicBaseUrl } from "../lib/public-base-url";
import { parseDeviceKey } from "../lib/device-key";

const router: IRouter = Router();

// QR da TV ainda não vinculada. O device não existe, então não há o que
// consultar: a key valida pelo formato e vira o link da tela de vínculo.
router.get("/qr/pair/:file", async (req, res): Promise<void> => {
  const file = req.params.file;
  const key = file.endsWith(".png") ? parseDeviceKey(file.slice(0, -4)) : null;
  if (!key) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  try {
    const base = publicBaseUrl(process.env, `${req.protocol}://${req.get("host")}`);
    const png = await QRCode.toBuffer(`${base}/parear/${key}`, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 512,
      color: { dark: "#000000", light: "#FFFFFF" },
    });

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(png);
  } catch (error) {
    req.log.error({ err: error }, "Error generating pairing QR code image");
    res.status(500).json({ error: "Failed to generate QR code image" });
  }
});

router.get("/qr/:file", async (req, res): Promise<void> => {
  const file = req.params.file;
  if (!file.endsWith(".png")) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const code = file.slice(0, -4);

  try {
    const [link] = await db
      .select({ id: campaignAnnouncementsTable.id })
      .from(campaignAnnouncementsTable)
      .where(eq(campaignAnnouncementsTable.scanCode, code));

    if (!link) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const base = publicBaseUrl(process.env, `${req.protocol}://${req.get("host")}`);
    const target = `${base}/r/${code}`;

    const png = await QRCode.toBuffer(target, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 512,
      color: { dark: "#000000", light: "#FFFFFF" },
    });

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(png);
  } catch (error) {
    req.log.error({ err: error }, "Error generating QR code image");
    res.status(500).json({ error: "Failed to generate QR code image" });
  }
});

export default router;
