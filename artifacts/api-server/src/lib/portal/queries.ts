// artifacts/api-server/src/lib/portal/queries.ts
import { inArray, eq, and, gte, lt, sql } from "drizzle-orm";
import {
  db, campaignsTable, playsTable, scansTable, devicesTable, advertisersTable, clientsTable, companiesTable,
} from "@workspace/db";
import { countReachedDevices } from "../ad-eligibility";
import { onlineSince } from "./overview";
import { portalPeriod, type PortalDays } from "./period";
import type { FeedDevice } from "../device-feed";

export interface PortalCampaignRow {
  id: number; name: string; startsAt: Date; endsAt: Date; isActive: boolean;
  deviceCount: number; totalPlays: number; totalScans: number; uniqueVisitors: number;
}

/** Campanhas dos anunciantes vinculados. NUNCA expõe contractValue. */
export async function advertiserCampaigns(advertiserIds: number[], days: PortalDays): Promise<PortalCampaignRow[]> {
  if (advertiserIds.length === 0) return [];
  // Cada contagem é uma subconsulta própria, amarrada à campanha e à janela.
  // Antes eram dois LEFT JOIN (exibições e scans) na mesma consulta: o banco
  // montava exibições × scans linhas por campanha só para o COUNT(DISTINCT)
  // desfazer depois — com 20 mil exibições e mil scans, uns 30 s de página.
  // Separadas, cada uma lê só as linhas daquela campanha no período pelos
  // índices compostos (campanha, created_at), e campanha sem nada no período
  // continua na lista, zerada — que é a informação que o anunciante precisa.
  const period = portalPeriod(days);
  const playsInWindow = sql`${playsTable.campaignId} = ${campaignsTable.id}
    and ${playsTable.createdAt} >= ${period.from} and ${playsTable.createdAt} < ${period.to}`;
  // Bot fica fora: anunciante não paga para ver crawler (mesma regra de
  // overview.ts).
  const humanScansInWindow = sql`${scansTable.campaignId} = ${campaignsTable.id}
    and ${scansTable.isBot} = false
    and ${scansTable.createdAt} >= ${period.from} and ${scansTable.createdAt} < ${period.to}`;
  const rows = await db
    .select({
      id: campaignsTable.id,
      name: campaignsTable.name,
      startsAt: campaignsTable.startsAt,
      endsAt: campaignsTable.endsAt,
      isActive: campaignsTable.isActive,
      targetMode: sql<"all" | "devices" | "segments">`${campaignsTable.targetMode}`,
      deviceIds: sql<number[]>`coalesce((select array_agg(cd.device_id) from campaign_devices cd where cd.campaign_id = ${campaignsTable.id}), array[]::int[])`,
      segmentIds: sql<number[]>`coalesce((select array_agg(cs.segment_id) from campaign_segments cs where cs.campaign_id = ${campaignsTable.id}), array[]::int[])`,
      advertiserSegmentId: companiesTable.segmentId,
      advertiserCompanyId: advertisersTable.companyId,
      totalPlays: sql<number>`(select count(*)::int from ${playsTable} where ${playsInWindow})`,
      totalScans: sql<number>`(select count(*)::int from ${scansTable} where ${humanScansInWindow})`,
      uniqueVisitors: sql<number>`(select count(distinct ${scansTable.fingerprint})::int from ${scansTable} where ${humanScansInWindow})`,
    })
    .from(campaignsTable)
    .innerJoin(advertisersTable, eq(advertisersTable.id, campaignsTable.advertiserId))
    .innerJoin(companiesTable, eq(companiesTable.id, advertisersTable.companyId))
    .where(inArray(campaignsTable.advertiserId, advertiserIds))
    .orderBy(campaignsTable.startsAt);

  // A cobertura depende do alvo e da regra de concorrência, então é contada
  // sobre a rede inteira — não dá para tirar de `campaign_devices`, que só tem
  // linha no modo "TVs escolhidas".
  const network = await db
    .select({ id: devicesTable.id, companyId: clientsTable.companyId, segmentId: companiesTable.segmentId })
    .from(devicesTable)
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId));

  return rows.map(({ targetMode, deviceIds, segmentIds, advertiserSegmentId, advertiserCompanyId, ...campaign }) => ({
    ...campaign,
    deviceCount: countReachedDevices(
      { targetMode, deviceIds, segmentIds, advertiserSegmentId, advertiserCompanyId },
      network,
    ),
  }));
}

export interface PortalDeviceRow {
  id: number; name: string; location: string | null; orientation: string; lastSeenAt: Date | null; totalPlays: number;
  isOnline: boolean;
}

/** Dispositivos dos clientes vinculados. */
export async function clientDevices(clientIds: number[], days: PortalDays): Promise<PortalDeviceRow[]> {
  if (clientIds.length === 0) return [];
  const now = new Date();
  const period = portalPeriod(days, now);
  const playsWindow = and(
    gte(playsTable.createdAt, period.from),
    lt(playsTable.createdAt, period.to),
  );
  // Mesma janela de `onlineSince` usada em clientOverview: se o card de "TVs
  // online agora" e a badge de cada linha vierem de dois relógios diferentes
  // (servidor vs. `Date.now()` do navegador), um cliente com o relógio
  // adiantado ou atrasado vê os dois discordando sobre o mesmo dispositivo.
  const rows = await db
    .select({
      id: devicesTable.id,
      name: devicesTable.name,
      location: devicesTable.location,
      orientation: devicesTable.orientation,
      lastSeenAt: devicesTable.lastSeenAt,
      totalPlays: sql<number>`COUNT(${playsTable.id})::int`,
      // COALESCE porque `lastSeenAt IS NULL` faz a comparação virar NULL, e
      // TV que nunca reportou não é "online" nem "não sei" — é offline.
      isOnline: sql<boolean>`COALESCE(${devicesTable.lastSeenAt} >= ${onlineSince(now)}, false)`,
    })
    .from(devicesTable)
    .leftJoin(playsTable, and(eq(playsTable.deviceId, devicesTable.id), playsWindow))
    .where(inArray(devicesTable.clientId, clientIds))
    .groupBy(devicesTable.id)
    .orderBy(devicesTable.name);
  return rows;
}

/**
 * O que a prévia do portal precisa da TV para montar a rotação: dono e
 * segmento (a regra de concorrência das campanhas depende dele). A checagem
 * de que a TV é de uma loja do usuário fica na rota.
 */
export async function previewDevice(deviceId: number): Promise<FeedDevice | null> {
  const [row] = await db
    .select({
      id: devicesTable.id,
      clientId: devicesTable.clientId,
      companyId: clientsTable.companyId,
      segmentId: companiesTable.segmentId,
      orientation: devicesTable.orientation,
    })
    .from(devicesTable)
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId))
    .where(eq(devicesTable.id, deviceId));
  return row ?? null;
}

export interface PortalClientRow {
  id: number;
  name: string;
}

/**
 * Lojas vinculadas ao usuário, com nome.
 *
 * Existe porque quem opera duas lojas precisa dizer em qual está criando o
 * painel, e um seletor com "cliente 7" e "cliente 12" não ajuda ninguém.
 * Devolve só o par id/nome: o portal não tem o que fazer com o resto do
 * cadastro do cliente.
 */
export async function clientsOf(clientIds: number[]): Promise<PortalClientRow[]> {
  if (clientIds.length === 0) return [];
  return db
    .select({ id: clientsTable.id, name: companiesTable.name })
    .from(clientsTable)
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId))
    .where(inArray(clientsTable.id, clientIds))
    .orderBy(companiesTable.name);
}
