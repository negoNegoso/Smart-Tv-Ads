import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, segmentsTable } from "@workspace/db";
import { ListSegmentsResponse, CreateSegmentBody, CreateSegmentResponse } from "@workspace/api-zod";
import { toSegmentSlug } from "../lib/segment-slug";

const router: IRouter = Router();

router.get("/segments", async (_req, res): Promise<void> => {
  const rows = await db
    .select({ id: segmentsTable.id, slug: segmentsTable.slug, name: segmentsTable.name })
    .from(segmentsTable)
    .orderBy(asc(segmentsTable.name));
  res.json(ListSegmentsResponse.parse(rows));
});

router.post("/segments", async (req, res): Promise<void> => {
  const parsed = CreateSegmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const name = parsed.data.name.trim();
  const slug = toSegmentSlug(name);
  if (!slug) {
    res.status(400).json({ error: "Nome de segmento inválido" });
    return;
  }

  const [existing] = await db.select().from(segmentsTable).where(eq(segmentsTable.slug, slug));
  if (existing) {
    res.status(409).json({ error: "Segmento já cadastrado" });
    return;
  }

  const [row] = await db.insert(segmentsTable).values({ slug, name }).returning();
  res.status(201).json(CreateSegmentResponse.parse(row));
});

export default router;
