import { Router, type IRouter } from "express";
import { eq, ne, asc, sql, and, type SQL } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  db,
  devicesTable,
  clientsTable,
  companiesTable,
  devicePlaylistTable,
  announcementsTable,
} from "@workspace/db";
import { pieceOrientationOf, screenOrientationOf } from "@workspace/db/orientation";
import { showcaseConflictMessage } from "../lib/showcase";
import {
  ListDevicesQueryParams,
  ListDevicesResponse,
  CreateDeviceBody,
  CreateDeviceResponse,
  GetDeviceParams,
  GetDeviceResponse,
  GetDeviceByKeyResponse,
  UpdateDeviceParams,
  UpdateDeviceBody,
  UpdateDeviceResponse,
  DeleteDeviceParams,
  GetDevicePlaylistParams,
  GetDevicePlaylistResponse,
  GetDevicePreviewParams,
  GetDevicePreviewResponse,
  AddToDevicePlaylistParams,
  AddToDevicePlaylistBody,
  AddToDevicePlaylistResponse,
  ReorderDevicePlaylistParams,
  ReorderDevicePlaylistBody,
  RemoveFromDevicePlaylistParams,
  TogglePlaylistItemParams,
  TogglePlaylistItemResponse,
} from "@workspace/api-zod";
import { loadDeviceSlides } from "../lib/device-feed";
import { normalizeDeviceKey, parseDeviceKey } from "../lib/device-key";
import { isUniqueViolation } from "../lib/pg-errors";
import { musicRefFromUrl } from "../lib/youtube/music";

const router: IRouter = Router();

async function getDeviceWithClient(where: SQL) {
  const rows = await db
    .select({
      id: devicesTable.id,
      clientId: devicesTable.clientId,
      clientName: companiesTable.name,
      name: devicesTable.name,
      location: devicesTable.location,
      orientation: devicesTable.orientation,
      deviceKey: devicesTable.deviceKey,
      lastSeenAt: devicesTable.lastSeenAt,
      showcase: devicesTable.showcase,
      musicUrl: devicesTable.musicUrl,
      createdAt: devicesTable.createdAt,
    })
    .from(devicesTable)
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId))
    .where(where);
  return rows[0] ?? null;
}

// List devices (optional clientId filter)
router.get("/devices", async (req, res): Promise<void> => {
  const queryParams = ListDevicesQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }

  const query = db
    .select({
      id: devicesTable.id,
      clientId: devicesTable.clientId,
      clientName: companiesTable.name,
      name: devicesTable.name,
      location: devicesTable.location,
      orientation: devicesTable.orientation,
      deviceKey: devicesTable.deviceKey,
      lastSeenAt: devicesTable.lastSeenAt,
      showcase: devicesTable.showcase,
      musicUrl: devicesTable.musicUrl,
      createdAt: devicesTable.createdAt,
    })
    .from(devicesTable)
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId));

  const rows = queryParams.data.clientId
    ? await query.where(eq(devicesTable.clientId, queryParams.data.clientId)).orderBy(asc(devicesTable.name))
    : await query.orderBy(asc(devicesTable.name));

  res.json(ListDevicesResponse.parse(rows));
});

// Create device. A TV em pareamento manda a própria key; sem ela, gera aqui.
router.post("/devices", async (req, res): Promise<void> => {
  const body =
    typeof req.body?.deviceKey === "string"
      ? { ...req.body, deviceKey: normalizeDeviceKey(req.body.deviceKey) }
      : req.body;
  const parsed = CreateDeviceBody.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const deviceKey = parsed.data.deviceKey ?? randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase();
  let row: { id: number };
  try {
    [row] = await db
      .insert(devicesTable)
      .values({ ...parsed.data, deviceKey })
      .returning();
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Esta TV já está vinculada." });
      return;
    }
    throw err;
  }
  const withClient = await getDeviceWithClient(eq(devicesTable.id, row.id));
  res.status(201).json(CreateDeviceResponse.parse(withClient));
});

// Device dono da key. Precisa vir antes de /devices/:id, senão "by-key"
// cai no parse numérico do id.
router.get("/devices/by-key/:key", async (req, res): Promise<void> => {
  const key = parseDeviceKey(req.params.key);
  if (!key) {
    res.status(400).json({ error: "Código de TV inválido." });
    return;
  }
  const row = await getDeviceWithClient(eq(devicesTable.deviceKey, key));
  if (!row) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  res.json(GetDeviceByKeyResponse.parse(row));
});

// Get device
router.get("/devices/:id", async (req, res): Promise<void> => {
  const params = GetDeviceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const row = await getDeviceWithClient(eq(devicesTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  res.json(GetDeviceResponse.parse(row));
});

// Update device
router.patch("/devices/:id", async (req, res): Promise<void> => {
  const params = UpdateDeviceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateDeviceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // Música de fundo: vazio tira a música; link que o player da TV não
  // consegue tocar é recusado aqui, senão a loja ficaria em silêncio sem
  // ninguém saber por quê.
  const data = { ...parsed.data };
  if (data.musicUrl !== undefined) {
    const link = (data.musicUrl ?? "").trim();
    if (!link) {
      data.musicUrl = null;
    } else if (!musicRefFromUrl(link)) {
      res.status(400).json({ error: "Link do YouTube inválido" });
      return;
    } else {
      data.musicUrl = link;
    }
  }
  const [current] = await db
    .select({ id: devicesTable.id, showcase: devicesTable.showcase, orientation: devicesTable.orientation })
    .from(devicesTable)
    .where(eq(devicesTable.id, params.data.id));
  if (!current) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  // Vale o estado depois do PATCH: ligar a vitrine e girar uma vitrine
  // existente caem na mesma regra.
  const next = {
    id: current.id,
    showcase: parsed.data.showcase ?? current.showcase,
    orientation: parsed.data.orientation ?? current.orientation,
  };
  if (next.showcase) {
    const others = await db
      .select({ id: devicesTable.id, name: devicesTable.name, orientation: devicesTable.orientation })
      .from(devicesTable)
      .where(and(eq(devicesTable.showcase, true), ne(devicesTable.id, current.id)));
    const conflict = showcaseConflictMessage(next, others);
    if (conflict) {
      res.status(409).json({ error: conflict });
      return;
    }
  }
  const [updated] = await db
    .update(devicesTable)
    .set(data)
    .where(eq(devicesTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  const withClient = await getDeviceWithClient(eq(devicesTable.id, updated.id));
  res.json(UpdateDeviceResponse.parse(withClient));
});

// Delete device
router.delete("/devices/:id", async (req, res): Promise<void> => {
  const params = DeleteDeviceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(devicesTable)
    .where(eq(devicesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  res.sendStatus(204);
});

// Get device playlist
router.get("/devices/:id/playlist", async (req, res): Promise<void> => {
  const params = GetDevicePlaylistParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const device = await db.select().from(devicesTable).where(eq(devicesTable.id, params.data.id));
  if (!device.length) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  const rows = await db
    .select({
      id: devicePlaylistTable.id,
      deviceId: devicePlaylistTable.deviceId,
      announcementId: devicePlaylistTable.announcementId,
      displayOrder: devicePlaylistTable.displayOrder,
      isActive: devicePlaylistTable.isActive,
      title: announcementsTable.title,
      imageUrl: announcementsTable.imageUrl,
      duration: announcementsTable.duration,
      orientation: announcementsTable.orientation,
    })
    .from(devicePlaylistTable)
    .innerJoin(announcementsTable, eq(announcementsTable.id, devicePlaylistTable.announcementId))
    .where(eq(devicePlaylistTable.deviceId, params.data.id))
    .orderBy(asc(devicePlaylistTable.displayOrder));
  res.json(GetDevicePlaylistResponse.parse(rows));
});

// Preview: a rotação que a TV exibe agora, sem os efeitos colaterais da TV
// (não grava lastSeenAt — abrir a página no admin não põe a TV online).
router.get("/devices/:id/preview", async (req, res): Promise<void> => {
  const params = GetDevicePreviewParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [device] = await db
    .select({
      id: devicesTable.id,
      clientId: devicesTable.clientId,
      companyId: clientsTable.companyId,
      segmentId: companiesTable.segmentId,
      orientation: devicesTable.orientation,
      showcase: devicesTable.showcase,
      showWeather: devicesTable.showWeather,
      companyHasCoordinates: sql<boolean>`(${companiesTable.lat} is not null and ${companiesTable.lng} is not null)`,
    })
    .from(devicesTable)
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId))
    .where(eq(devicesTable.id, params.data.id));
  if (!device) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  const slides = await loadDeviceSlides(device, req.log);
  res.json(GetDevicePreviewResponse.parse(slides));
});

// Add to playlist
router.post("/devices/:id/playlist/add", async (req, res): Promise<void> => {
  const params = AddToDevicePlaylistParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = AddToDevicePlaylistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const deviceId = params.data.id;

  // Peça de outra orientação nunca iria ao ar nesta TV (o feed filtra); aceitar
  // deixaria um item fantasma na playlist, contando como se estivesse passando.
  const [pair] = await db
    .select({ deviceOrientation: devicesTable.orientation, pieceOrientation: announcementsTable.orientation, pieceSource: announcementsTable.source })
    .from(devicesTable)
    .innerJoin(announcementsTable, eq(announcementsTable.id, parsed.data.announcementId))
    .where(eq(devicesTable.id, deviceId));
  if (!pair) {
    res.status(404).json({ error: "Device or announcement not found" });
    return;
  }
  // A arte do aviso é gerada e vive só durante o aviso; na playlist ficaria
  // órfã quando o aviso fosse encerrado.
  if (pair.pieceSource === "alert") {
    res.status(400).json({ error: "Arte de aviso urgente não pode ser usada na playlist." });
    return;
  }
  if (pair.pieceSource === "editorial") {
    // Peça de sistema (slide de clima): entra na TV pelo feed, não à mão.
    res.status(400).json({ error: "Peça de sistema não pode ser usada na playlist." });
    return;
  }
  const screen = screenOrientationOf(pair.deviceOrientation);
  const piece = pieceOrientationOf(pair.pieceOrientation);
  if (screen !== piece) {
    res.status(400).json({
      error: piece === "portrait" ? "Peça vertical não toca em TV horizontal" : "Peça horizontal não toca em TV retrato",
    });
    return;
  }

  const [maxOrderRow] = await db
    .select({ maxOrder: sql<number>`COALESCE(MAX(${devicePlaylistTable.displayOrder}), -1)` })
    .from(devicePlaylistTable)
    .where(eq(devicePlaylistTable.deviceId, deviceId));
  const nextOrder = (maxOrderRow?.maxOrder ?? -1) + 1;

  const [inserted] = await db
    .insert(devicePlaylistTable)
    .values({
      deviceId,
      announcementId: parsed.data.announcementId,
      displayOrder: parsed.data.displayOrder ?? nextOrder,
    })
    .onConflictDoNothing()
    .returning();

  if (!inserted) {
    res.status(400).json({ error: "Announcement already in playlist" });
    return;
  }

  const [row] = await db
    .select({
      id: devicePlaylistTable.id,
      deviceId: devicePlaylistTable.deviceId,
      announcementId: devicePlaylistTable.announcementId,
      displayOrder: devicePlaylistTable.displayOrder,
      isActive: devicePlaylistTable.isActive,
      title: announcementsTable.title,
      imageUrl: announcementsTable.imageUrl,
      duration: announcementsTable.duration,
      orientation: announcementsTable.orientation,
    })
    .from(devicePlaylistTable)
    .innerJoin(announcementsTable, eq(announcementsTable.id, devicePlaylistTable.announcementId))
    .where(eq(devicePlaylistTable.id, inserted.id));

  res.status(201).json(AddToDevicePlaylistResponse.parse(row));
});

// Reorder playlist
router.post("/devices/:id/playlist/reorder", async (req, res): Promise<void> => {
  const params = ReorderDevicePlaylistParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = ReorderDevicePlaylistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await Promise.all(
    parsed.data.ids.map((announcementId, index) =>
      db
        .update(devicePlaylistTable)
        .set({ displayOrder: index })
        .where(
          and(
            eq(devicePlaylistTable.deviceId, params.data.id),
            eq(devicePlaylistTable.announcementId, announcementId)
          )
        )
    )
  );
  res.json({ ok: true });
});

// Remove from playlist
router.delete("/devices/:deviceId/playlist/:announcementId", async (req, res): Promise<void> => {
  const params = RemoveFromDevicePlaylistParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(devicePlaylistTable)
    .where(
      and(
        eq(devicePlaylistTable.deviceId, params.data.deviceId),
        eq(devicePlaylistTable.announcementId, params.data.announcementId)
      )
    )
    .returning();
  if (!row) {
    res.status(404).json({ error: "Playlist item not found" });
    return;
  }
  res.sendStatus(204);
});

// Toggle playlist item
router.patch("/devices/:id/playlist/:announcementId/toggle", async (req, res): Promise<void> => {
  const params = TogglePlaylistItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(devicePlaylistTable)
    .where(
      and(
        eq(devicePlaylistTable.deviceId, params.data.id),
        eq(devicePlaylistTable.announcementId, params.data.announcementId)
      )
    );
  if (!existing) {
    res.status(404).json({ error: "Playlist item not found" });
    return;
  }
  const [updated] = await db
    .update(devicePlaylistTable)
    .set({ isActive: !existing.isActive })
    .where(eq(devicePlaylistTable.id, existing.id))
    .returning();

  const [row] = await db
    .select({
      id: devicePlaylistTable.id,
      deviceId: devicePlaylistTable.deviceId,
      announcementId: devicePlaylistTable.announcementId,
      displayOrder: devicePlaylistTable.displayOrder,
      isActive: devicePlaylistTable.isActive,
      title: announcementsTable.title,
      imageUrl: announcementsTable.imageUrl,
      duration: announcementsTable.duration,
      orientation: announcementsTable.orientation,
    })
    .from(devicePlaylistTable)
    .innerJoin(announcementsTable, eq(announcementsTable.id, devicePlaylistTable.announcementId))
    .where(eq(devicePlaylistTable.id, updated.id));

  res.json(TogglePlaylistItemResponse.parse(row));
});

export default router;
