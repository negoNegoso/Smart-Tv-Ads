import { Router, type IRouter } from "express";
import { eq, asc, sql, desc } from "drizzle-orm";
import { db, clientsTable, devicesTable, impressionsTable, announcementsTable } from "@workspace/db";
import {
  ListClientsResponse,
  CreateClientBody,
  CreateClientResponse,
  GetClientParams,
  GetClientResponse,
  UpdateClientParams,
  UpdateClientBody,
  UpdateClientResponse,
  DeleteClientParams,
  GetClientStatsParams,
  GetClientStatsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function getClientWithCount(id: number) {
  const rows = await db
    .select({
      id: clientsTable.id,
      name: clientsTable.name,
      email: clientsTable.email,
      phone: clientsTable.phone,
      createdAt: clientsTable.createdAt,
      deviceCount: sql<number>`COUNT(${devicesTable.id})::int`,
    })
    .from(clientsTable)
    .leftJoin(devicesTable, eq(devicesTable.clientId, clientsTable.id))
    .where(eq(clientsTable.id, id))
    .groupBy(clientsTable.id);
  return rows[0] ?? null;
}

router.get("/clients", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: clientsTable.id,
      name: clientsTable.name,
      email: clientsTable.email,
      phone: clientsTable.phone,
      createdAt: clientsTable.createdAt,
      deviceCount: sql<number>`COUNT(${devicesTable.id})::int`,
    })
    .from(clientsTable)
    .leftJoin(devicesTable, eq(devicesTable.clientId, clientsTable.id))
    .groupBy(clientsTable.id)
    .orderBy(asc(clientsTable.name));
  res.json(ListClientsResponse.parse(rows));
});

router.post("/clients", async (req, res): Promise<void> => {
  const parsed = CreateClientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(clientsTable).values(parsed.data).returning();
  const withCount = await getClientWithCount(row.id);
  res.status(201).json(CreateClientResponse.parse(withCount));
});

router.get("/clients/:id", async (req, res): Promise<void> => {
  const params = GetClientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const row = await getClientWithCount(params.data.id);
  if (!row) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  res.json(GetClientResponse.parse(row));
});

router.patch("/clients/:id", async (req, res): Promise<void> => {
  const params = UpdateClientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateClientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [updated] = await db
    .update(clientsTable)
    .set(parsed.data)
    .where(eq(clientsTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  const withCount = await getClientWithCount(updated.id);
  res.json(UpdateClientResponse.parse(withCount));
});

router.delete("/clients/:id", async (req, res): Promise<void> => {
  const params = DeleteClientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(clientsTable)
    .where(eq(clientsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/clients/:id/stats", async (req, res): Promise<void> => {
  const params = GetClientStatsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const clientId = params.data.id;
  const client = await getClientWithCount(clientId);
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  const [agg] = await db
    .select({
      totalImpressions: sql<number>`COUNT(${impressionsTable.id})::int`,
      totalDuration: sql<number>`COALESCE(SUM(${impressionsTable.durationSeconds}), 0)::int`,
    })
    .from(impressionsTable)
    .innerJoin(devicesTable, eq(devicesTable.id, impressionsTable.deviceId))
    .where(eq(devicesTable.clientId, clientId));

  const topAnnouncements = await db
    .select({
      announcementId: impressionsTable.announcementId,
      title: announcementsTable.title,
      impressions: sql<number>`COUNT(${impressionsTable.id})::int`,
      totalDuration: sql<number>`COALESCE(SUM(${impressionsTable.durationSeconds}), 0)::int`,
    })
    .from(impressionsTable)
    .innerJoin(devicesTable, eq(devicesTable.id, impressionsTable.deviceId))
    .innerJoin(announcementsTable, eq(announcementsTable.id, impressionsTable.announcementId))
    .where(eq(devicesTable.clientId, clientId))
    .groupBy(impressionsTable.announcementId, announcementsTable.title)
    .orderBy(desc(sql`COUNT(${impressionsTable.id})`))
    .limit(10);

  res.json(
    GetClientStatsResponse.parse({
      clientId,
      clientName: client.name,
      totalDevices: client.deviceCount,
      totalImpressions: agg?.totalImpressions ?? 0,
      totalDuration: agg?.totalDuration ?? 0,
      topAnnouncements,
    })
  );
});

export default router;
