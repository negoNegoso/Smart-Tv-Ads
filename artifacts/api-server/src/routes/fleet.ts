import { Router, type IRouter } from "express";
import { asc, eq, inArray } from "drizzle-orm";
import { db, devicesTable, clientsTable, companiesTable } from "@workspace/db";
import {
  GetDeviceSessionsParams,
  GetDeviceSessionsResponse,
  GetFleetResponse,
  RequestFleetUpdateBody,
  RequestFleetUpdateResponse,
} from "@workspace/api-zod";
import { isOnlineAt } from "../lib/device-presence";
import { listDeviceSessions } from "../lib/device-sessions";
import { latestTvAppRelease } from "../lib/tv-app-release";
import { isOutdatedTvApp } from "../lib/tv-app-version";

const router: IRouter = Router();

/**
 * Parque de TVs: a foto do agora. `isOnline` e `outdated` saem daqui, e não do
 * navegador, para que o card de contagem e o selo de cada linha venham do
 * mesmo relógio e da mesma release.
 */
router.get("/fleet", async (req, res): Promise<void> => {
  const now = new Date();

  const rows = await db
    .select({
      id: devicesTable.id,
      clientId: devicesTable.clientId,
      clientName: companiesTable.name,
      name: devicesTable.name,
      location: devicesTable.location,
      showcase: devicesTable.showcase,
      lastSeenAt: devicesTable.lastSeenAt,
      appVersion: devicesTable.appVersion,
      updateRequestedAt: devicesTable.updateRequestedAt,
    })
    .from(devicesTable)
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId))
    .orderBy(asc(devicesTable.name));

  // GitHub fora não pode esconder o parque: sem a última versão, ninguém é
  // marcado como desatualizado e o resto da página segue valendo.
  let latestVersion: string | null = null;
  try {
    latestVersion = (await latestTvAppRelease()).versionName;
  } catch (err) {
    req.log.warn({ err }, "Última versão do app indisponível; parque sem selo de desatualizada");
  }

  res.json(
    GetFleetResponse.parse({
      latestVersion,
      devices: rows.map((row) => ({
        ...row,
        isOnline: isOnlineAt(row.lastSeenAt, now),
        outdated: isOutdatedTvApp(row.appVersion, latestVersion),
      })),
    }),
  );
});

/**
 * Gatilho do admin: marca o pedido e o próximo feed de cada TV leva o aviso
 * (routes/display.ts). Não instala nada daqui — a TV checa, baixa e, onde o
 * Android exige, espera o OK no controle.
 */
router.post("/fleet/update-requests", async (req, res): Promise<void> => {
  // Sem corpo o Express entrega `undefined`; vale o mesmo que `{}` (todas).
  const body = RequestFleetUpdateBody.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  // O zod gerado aceita qualquer número; sem esta checagem 1.5 ou um valor
  // acima do int4 chegaria ao Postgres e viraria 500 em vez de 400.
  const INT4_MAX = 2147483647;
  if (body.data.deviceIds?.some((id) => !Number.isInteger(id) || id <= 0 || id > INT4_MAX)) {
    res.status(400).json({ error: "deviceIds deve conter só ids inteiros de TV" });
    return;
  }

  const marcar = db.update(devicesTable).set({ updateRequestedAt: new Date() });
  const ids = body.data.deviceIds;
  const rows = await (ids ? marcar.where(inArray(devicesTable.id, ids)) : marcar).returning({
    id: devicesTable.id,
  });

  res.json(RequestFleetUpdateResponse.parse({ requested: rows.length }));
});

// Histórico de conexão de uma TV. Fica aqui, e não em devices.ts, porque é
// leitura de presença como a rota de cima.
router.get("/devices/:id/sessions", async (req, res): Promise<void> => {
  const params = GetDeviceSessionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [device] = await db
    .select({ id: devicesTable.id, lastSeenAt: devicesTable.lastSeenAt })
    .from(devicesTable)
    .where(eq(devicesTable.id, params.data.id));
  if (!device) {
    res.status(404).json({ error: "Device not found" });
    return;
  }

  const now = new Date();
  const sessions = await listDeviceSessions(device.id, now);
  res.json(GetDeviceSessionsResponse.parse({ isOnline: isOnlineAt(device.lastSeenAt, now), sessions }));
});

export default router;
