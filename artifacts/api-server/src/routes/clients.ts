import { Router, type IRouter } from "express";
import { eq, asc, sql, desc } from "drizzle-orm";
import { db, clientsTable, companiesTable, devicesTable, playsTable, announcementsTable, segmentsTable } from "@workspace/db";
import {
  ListClientsResponse,
  GetClientParams,
  GetClientResponse,
  GetClientStatsParams,
  GetClientStatsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const clientSelection = {
  id: clientsTable.id,
  companyId: clientsTable.companyId,
  name: companiesTable.name,
  email: companiesTable.email,
  phone: companiesTable.phone,
  segmentId: companiesTable.segmentId,
  segmentName: segmentsTable.name,
  createdAt: clientsTable.createdAt,
  deviceCount: sql<number>`COUNT(${devicesTable.id})::int`,
};

function clientQuery() {
  return db
    .select(clientSelection)
    .from(clientsTable)
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId))
    .leftJoin(segmentsTable, eq(segmentsTable.id, companiesTable.segmentId))
    .leftJoin(devicesTable, eq(devicesTable.clientId, clientsTable.id))
    .groupBy(clientsTable.id, companiesTable.id, segmentsTable.name);
}

async function getClientWithCount(id: number) {
  const rows = await clientQuery().where(eq(clientsTable.id, id));
  return rows[0] ?? null;
}

router.get("/clients", async (_req, res): Promise<void> => {
  const rows = await clientQuery().orderBy(asc(companiesTable.name));
  res.json(ListClientsResponse.parse(rows));
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
      totalPlays: sql<number>`COUNT(${playsTable.id})::int`,
      totalDuration: sql<number>`COALESCE(SUM(${playsTable.durationSeconds}), 0)::int`,
    })
    .from(playsTable)
    .innerJoin(devicesTable, eq(devicesTable.id, playsTable.deviceId))
    .where(eq(devicesTable.clientId, clientId));

  const topAnnouncements = await db
    .select({
      announcementId: playsTable.announcementId,
      title: announcementsTable.title,
      plays: sql<number>`COUNT(${playsTable.id})::int`,
      totalDuration: sql<number>`COALESCE(SUM(${playsTable.durationSeconds}), 0)::int`,
    })
    .from(playsTable)
    .innerJoin(devicesTable, eq(devicesTable.id, playsTable.deviceId))
    .innerJoin(announcementsTable, eq(announcementsTable.id, playsTable.announcementId))
    .where(eq(devicesTable.clientId, clientId))
    .groupBy(playsTable.announcementId, announcementsTable.title)
    .orderBy(desc(sql`COUNT(${playsTable.id})`))
    .limit(10);

  res.json(
    GetClientStatsResponse.parse({
      clientId,
      clientName: client.name,
      totalDevices: client.deviceCount,
      totalPlays: agg?.totalPlays ?? 0,
      totalDuration: agg?.totalDuration ?? 0,
      topAnnouncements,
    })
  );
});

export default router;
