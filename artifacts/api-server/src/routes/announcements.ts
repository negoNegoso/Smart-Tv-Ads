import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { eq, asc, sql } from "drizzle-orm";
import { db, announcementsTable } from "@workspace/db";
import { mediaStore } from "../lib/storage";
import { maxUploadBytes, uploadTooLargeMessage } from "../lib/upload-limit";
import { parseFormBoolean } from "../lib/form-values";
import { normalizeDisplayText } from "../lib/slide-caption";
import {
  ListAnnouncementsResponse,
  ListAnnouncementsResponseItem,
  ListActiveAnnouncementsResponse,
  ListActiveAnnouncementsResponseItem,
  CreateAnnouncementBody,
  CreateAnnouncementResponse,
  GetAnnouncementParams,
  GetAnnouncementResponse,
  UpdateAnnouncementParams,
  UpdateAnnouncementBody,
  UpdateAnnouncementResponse,
  DeleteAnnouncementParams,
  ToggleAnnouncementParams,
  ToggleAnnouncementResponse,
  GetAnnouncementStatsResponse,
  ReorderAnnouncementsBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

const uploadsDir = path.resolve(process.cwd(), "uploads");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadBytes() },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

/**
 * Wraps multer so that its errors become explicit HTTP responses. On Vercel the
 * request body cap is lower than the default limit, so an oversized upload is an
 * expected outcome and must return a message the operator can act on.
 */
function uploadImage(req: Request, res: Response, next: NextFunction): void {
  upload.single("image")(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: uploadTooLargeMessage(maxUploadBytes()) });
      return;
    }
    if (err instanceof Error && err.message === "Only image files are allowed") {
      res.status(400).json({ error: "Apenas arquivos de imagem são aceitos." });
      return;
    }
    next(err);
  });
}

async function persistImage(file: Express.Multer.File): Promise<string> {
  return mediaStore().put(file.buffer, file.mimetype, file.originalname);
}

/**
 * One-time migration of images written to local disk before App Storage existed.
 * Gated on PRIVATE_OBJECT_DIR: outside Replit there is no legacy disk to read,
 * and running it would issue a full table scan on every cold start.
 */
async function migrateLegacyImages() {
  const rows = await db.select().from(announcementsTable);
  for (const row of rows) {
    if (!row.imageUrl.startsWith("/api/uploads/")) continue;
    const filename = row.imageUrl.split("/").pop();
    if (!filename) continue;
    const filePath = path.join(uploadsDir, filename);
    if (!fs.existsSync(filePath)) continue;
    try {
      const storedPath = await mediaStore().put(
        fs.readFileSync(filePath),
        "image/" + path.extname(filename).slice(1),
        filename,
      );
      await db.update(announcementsTable).set({ imageUrl: storedPath }).where(eq(announcementsTable.id, row.id));
    } catch (error) {
      console.error(`Could not migrate announcement image ${row.id}`, error);
    }
  }
}

if (process.env.PRIVATE_OBJECT_DIR) {
  void migrateLegacyImages();
}

router.get("/announcements", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(announcementsTable)
    .orderBy(asc(announcementsTable.displayOrder), asc(announcementsTable.createdAt));
  res.json(ListAnnouncementsResponse.parse(rows));
});

router.post(
  "/announcements",
  uploadImage,
  async (req, res): Promise<void> => {
    // FormData sends all fields as strings — coerce duration to number before Zod validation
    const body = {
      title: req.body.title,
      displayText: req.body.displayText != null ? String(req.body.displayText) : undefined,
      showText: parseFormBoolean(req.body.showText),
      duration: req.body.duration != null ? Number(req.body.duration) : undefined,
    };
    const parsed = CreateAnnouncementBody.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "Image file is required" });
      return;
    }
    let imageUrl: string;
    try {
      imageUrl = await persistImage(req.file);
    } catch (error) {
      res.status(502).json({ error: "Could not persist image in object storage" });
      return;
    }
    const maxOrderRow = await db
      .select({ maxOrder: sql<number>`COALESCE(MAX(${announcementsTable.displayOrder}), -1)` })
      .from(announcementsTable);
    const nextOrder = (maxOrderRow[0]?.maxOrder ?? -1) + 1;
    const [row] = await db
      .insert(announcementsTable)
      .values({
        title: parsed.data.title,
        displayText: normalizeDisplayText(parsed.data.displayText),
        showText: parsed.data.showText ?? false,
        imageUrl,
        duration: parsed.data.duration ?? 10,
        displayOrder: nextOrder,
      })
      .returning();
    res.status(201).json(CreateAnnouncementResponse.parse(row));
  }
);

router.get("/announcements/active", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(announcementsTable)
    .where(eq(announcementsTable.isActive, true))
    .orderBy(asc(announcementsTable.displayOrder), asc(announcementsTable.createdAt));
  res.json(ListActiveAnnouncementsResponse.parse(rows));
});

router.get("/announcements/stats", async (req, res): Promise<void> => {
  const [totals] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      active: sql<number>`COUNT(*) FILTER (WHERE ${announcementsTable.isActive} = true)::int`,
      inactive: sql<number>`COUNT(*) FILTER (WHERE ${announcementsTable.isActive} = false)::int`,
    })
    .from(announcementsTable);
  res.json(GetAnnouncementStatsResponse.parse(totals));
});

router.post("/announcements/reorder", async (req, res): Promise<void> => {
  const parsed = ReorderAnnouncementsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await Promise.all(
    parsed.data.ids.map((id, index) =>
      db
        .update(announcementsTable)
        .set({ displayOrder: index })
        .where(eq(announcementsTable.id, id))
    )
  );
  res.json({ ok: true });
});

router.get("/announcements/:id", async (req, res): Promise<void> => {
  const params = GetAnnouncementParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(announcementsTable)
    .where(eq(announcementsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Announcement not found" });
    return;
  }
  res.json(GetAnnouncementResponse.parse(row));
});

router.patch(
  "/announcements/:id",
  uploadImage,
  async (req, res): Promise<void> => {
    const params = UpdateAnnouncementParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    // FormData envia todos os campos como string — coage duration e showText antes do Zod
    const body: Record<string, unknown> = {};
    if (req.body.title !== undefined) body.title = req.body.title;
    if (req.body.displayText !== undefined) {
      body.displayText = normalizeDisplayText(String(req.body.displayText));
    }
    const showText = parseFormBoolean(req.body.showText);
    if (showText !== undefined) body.showText = showText;
    if (req.body.duration !== undefined && req.body.duration !== "") {
      body.duration = Number(req.body.duration);
    }
    const parsed = UpdateAnnouncementBody.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [existing] = await db
      .select()
      .from(announcementsTable)
      .where(eq(announcementsTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Announcement not found" });
      return;
    }

    const updates: Record<string, unknown> = { ...parsed.data };

    if (req.file) {
      let imageUrl: string;
      try {
        imageUrl = await persistImage(req.file);
      } catch (error) {
        res.status(502).json({ error: "Could not persist image in object storage" });
        return;
      }
      updates.imageUrl = imageUrl;
    }

    if (Object.keys(updates).length === 0) {
      res.json(UpdateAnnouncementResponse.parse(existing));
      return;
    }

    const [row] = await db
      .update(announcementsTable)
      .set(updates)
      .where(eq(announcementsTable.id, params.data.id))
      .returning();

    if (req.file) {
      try {
        await mediaStore().remove(existing.imageUrl);
      } catch (error) {
        req.log.error({ err: error }, "Could not remove replaced announcement image");
      }
    }

    res.json(UpdateAnnouncementResponse.parse(row));
  }
);

router.delete("/announcements/:id", async (req, res): Promise<void> => {
  const params = DeleteAnnouncementParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(announcementsTable)
    .where(eq(announcementsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Announcement not found" });
    return;
  }
  try {
    await mediaStore().remove(row.imageUrl);
  } catch (error) {
    req.log.error({ err: error }, "Could not remove deleted announcement image");
  }
  res.sendStatus(204);
});

router.patch("/announcements/:id/toggle", async (req, res): Promise<void> => {
  const params = ToggleAnnouncementParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(announcementsTable)
    .where(eq(announcementsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Announcement not found" });
    return;
  }
  const [row] = await db
    .update(announcementsTable)
    .set({ isActive: !existing.isActive })
    .where(eq(announcementsTable.id, params.data.id))
    .returning();
  res.json(ToggleAnnouncementResponse.parse(row));
});

export default router;
