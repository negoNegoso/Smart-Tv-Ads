// artifacts/api-server/src/routes/urgent-alerts.ts
import { Router, type IRouter } from "express";
import { desc, eq, inArray } from "drizzle-orm";
import {
  db,
  announcementsTable,
  clientsTable,
  companiesTable,
  devicesTable,
  urgentAlertsTable,
  type UrgentAlert,
} from "@workspace/db";
import { alertInput } from "../lib/alerts/alert-input";
import { alertReachesDevice, alertStatus } from "../lib/alerts/alert-eligibility";
import { renderAlert } from "../lib/alerts/render";
import { mediaStore } from "../lib/storage";

const router: IRouter = Router();

/** Quantos avisos fora do ar o histórico mostra. */
const HISTORY_LIMIT = 20;

/**
 * Formato que o admin lê: status calculado agora, quantas TVs o alvo pega
 * (vitrine fora, ela ignora avisos) e as URLs das duas artes.
 */
async function describeAlerts(rows: UrgentAlert[], now: Date = new Date()) {
  const devices = await db
    .select({ companyId: clientsTable.companyId, segmentId: companiesTable.segmentId, showcase: devicesTable.showcase })
    .from(devicesTable)
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId));
  const screens = devices.filter((device) => !device.showcase);

  const pieceIds = rows
    .flatMap((row) => [row.landscapeAnnouncementId, row.portraitAnnouncementId])
    .filter((id): id is number => id != null);
  const pieces = pieceIds.length
    ? await db
        .select({ id: announcementsTable.id, imageUrl: announcementsTable.imageUrl })
        .from(announcementsTable)
        .where(inArray(announcementsTable.id, pieceIds))
    : [];
  const imageOf = new Map(pieces.map((piece) => [piece.id, piece.imageUrl]));

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    targetMode: row.targetMode,
    segmentIds: row.segmentIds,
    companyIds: row.companyIds,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    status: alertStatus(row, now),
    reachedDevices: screens.filter((device) => alertReachesDevice(row, device)).length,
    landscapeImageUrl: row.landscapeAnnouncementId != null ? imageOf.get(row.landscapeAnnouncementId) ?? null : null,
    portraitImageUrl: row.portraitAnnouncementId != null ? imageOf.get(row.portraitAnnouncementId) ?? null : null,
  }));
}

router.post("/urgent-alerts", async (req, res): Promise<void> => {
  const parsed = alertInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
    return;
  }
  const input = parsed.data;
  const now = new Date();
  const art = { title: input.title, body: input.body };

  // Desenha tudo antes de gravar qualquer coisa: arte que falha não deixa
  // aviso pela metade no banco.
  let landscapePng: Buffer;
  let portraitPng: Buffer;
  try {
    [landscapePng, portraitPng] = await Promise.all([renderAlert(art, "landscape"), renderAlert(art, "portrait")]);
  } catch (err) {
    req.log.error({ err }, "Falha ao desenhar o aviso urgente");
    res.status(500).json({ error: "Não foi possível gerar a arte do aviso." });
    return;
  }

  const store = mediaStore();
  const stamp = now.getTime();
  const [landscapeUrl, portraitUrl] = await Promise.all([
    store.put(landscapePng, "image/png", `alert-${stamp}-landscape.png`),
    store.put(portraitPng, "image/png", `alert-${stamp}-portrait.png`),
  ]);

  const piece = (orientation: "landscape" | "portrait", imageUrl: string) => ({
    title: input.title,
    imageUrl,
    mediaKind: "image",
    orientation,
    source: "alert",
    duration: 15,
    isActive: true,
  });

  const alert = await db.transaction(async (tx) => {
    const [landscape] = await tx
      .insert(announcementsTable)
      .values(piece("landscape", landscapeUrl))
      .returning({ id: announcementsTable.id });
    const [portrait] = await tx
      .insert(announcementsTable)
      .values(piece("portrait", portraitUrl))
      .returning({ id: announcementsTable.id });
    const [row] = await tx
      .insert(urgentAlertsTable)
      .values({
        title: input.title,
        body: input.body,
        targetMode: input.targetMode,
        // Só o alvo do modo escolhido vai para o banco.
        segmentIds: input.targetMode === "segments" ? input.segmentIds : [],
        companyIds: input.targetMode === "companies" ? input.companyIds : [],
        startsAt: now,
        endsAt: new Date(stamp + input.durationMinutes * 60_000),
        landscapeAnnouncementId: landscape.id,
        portraitAnnouncementId: portrait.id,
        createdAt: now,
      })
      .returning();
    return row;
  });

  const [view] = await describeAlerts([alert], now);
  res.status(201).json(view);
});

router.get("/urgent-alerts", async (_req, res): Promise<void> => {
  const now = new Date();
  const rows = await db
    .select()
    .from(urgentAlertsTable)
    .orderBy(desc(urgentAlertsTable.createdAt), desc(urgentAlertsTable.id))
    .limit(100);
  const byNewest = [...rows].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id,
  );
  const active = byNewest.filter((row) => alertStatus(row, now) === "active");
  const history = byNewest.filter((row) => alertStatus(row, now) !== "active").slice(0, HISTORY_LIMIT);
  res.json(await describeAlerts([...active, ...history], now));
});

router.post("/urgent-alerts/:id/end", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [existing] = Number.isInteger(id) && id > 0
    ? await db.select().from(urgentAlertsTable).where(eq(urgentAlertsTable.id, id))
    : [];
  if (!existing) {
    res.status(404).json({ error: "Aviso não encontrado." });
    return;
  }
  // Encerrar de novo não muda a hora do primeiro encerramento.
  let row = existing;
  if (!existing.endedAt) {
    [row] = await db
      .update(urgentAlertsTable)
      .set({ endedAt: new Date() })
      .where(eq(urgentAlertsTable.id, id))
      .returning();
  }
  const [view] = await describeAlerts([row]);
  res.json(view);
});

export default router;
