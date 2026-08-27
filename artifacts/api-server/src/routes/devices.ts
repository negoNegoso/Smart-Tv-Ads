import { Router, type IRouter } from "express";
import { eq, asc, sql, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  db,
  devicesTable,
  clientsTable,
  devicePlaylistTable,
  announcementsTable,
} from "@workspace/db";
import {
  ListDevicesQueryParams,
  ListDevicesResponse,
  CreateDeviceBody,
  CreateDeviceResponse,
  GetDeviceParams,
  GetDeviceResponse,
  UpdateDeviceParams,
  UpdateDeviceBody,
  UpdateDeviceResponse,
  DeleteDeviceParams,
  GetDevicePlaylistParams,
  GetDevicePlaylistResponse,
  AddToDevicePlaylistParams,
  AddToDevicePlaylistBody,
  AddToDevicePlaylistResponse,
  ReorderDevicePlaylistParams,
  ReorderDevicePlaylistBody,
  RemoveFromDevicePlaylistParams,
  TogglePlaylistItemParams,
  TogglePlaylistItemResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function getDeviceWithClient(id: number) {
  const rows = await db
    .select({
      id: devicesTable.id,
      clientId: devicesTable.clientId,
      clientName: clientsTable.name,
      name: devicesTable.name,
      location: devicesTable.location,
      deviceKey: devicesTable.deviceKey,
      lastSeenAt: devicesTable.lastSeenAt,
      createdAt: devicesTable.createdAt,
    })
    .from(devicesTable)
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .where(eq(devicesTable.id, id));
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
      clientName: clientsTable.name,
      name: devicesTable.name,
      location: devicesTable.location,
      deviceKey: devicesTable.deviceKey,
      lastSeenAt: devicesTable.lastSeenAt,
      createdAt: devicesTable.createdAt,
    })
    .from(devicesTable)
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId));

  const rows = queryParams.data.clientId
    ? await query.where(eq(devicesTable.clientId, queryParams.data.clientId)).orderBy(asc(devicesTable.name))
    : await query.orderBy(asc(devicesTable.name));

  res.json(ListDevicesResponse.parse(rows));
});

// Create device
router.post("/devices", async (req, res): Promise<void> => {
  const parsed = CreateDeviceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const deviceKey = randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase();
  const [row] = await db
    .insert(devicesTable)
    .values({ ...parsed.data, deviceKey })
    .returning();
  const withClient = await getDeviceWithClient(row.id);
  res.status(201).json(CreateDeviceResponse.parse(withClient));
});

// Get device
router.get("/devices/:id", async (req, res): Promise<void> => {
  const params = GetDeviceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const row = await getDeviceWithClient(params.data.id);
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
  const [updated] = await db
    .update(devicesTable)
    .set(parsed.data)
    .where(eq(devicesTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  const withClient = await getDeviceWithClient(updated.id);
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
    })
    .from(devicePlaylistTable)
    .innerJoin(announcementsTable, eq(announcementsTable.id, devicePlaylistTable.announcementId))
    .where(eq(devicePlaylistTable.deviceId, params.data.id))
    .orderBy(asc(devicePlaylistTable.displayOrder));
  res.json(GetDevicePlaylistResponse.parse(rows));
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
    })
    .from(devicePlaylistTable)
    .innerJoin(announcementsTable, eq(announcementsTable.id, devicePlaylistTable.announcementId))
    .where(eq(devicePlaylistTable.id, updated.id));

  res.json(TogglePlaylistItemResponse.parse(row));
});

export default router;
