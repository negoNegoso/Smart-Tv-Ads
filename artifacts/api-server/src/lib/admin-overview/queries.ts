import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import {
  advertisersTable,
  announcementsTable,
  campaignsTable,
  clientsTable,
  companiesTable,
  db,
  devicesTable,
  deviceSessionsTable,
  playsTable,
  scansTable,
} from "@workspace/db";
import { BUSINESS_TIME_ZONE } from "../ad-eligibility";
import { isOnlineAt } from "../device-presence";
import { scanRate } from "../scan-rate";
import {
  businessDayKey,
  portalPeriod,
  previousPortalPeriod,
  type PortalDays,
  type PortalPeriod,
} from "../portal/period";
import { dailyAvailability, nextDayKey } from "./availability";
import { fillHours, type HourPoint } from "./hours";
import { overviewSeries, type AnalyticsDayPoint } from "./series";

/**
 * Data local do negócio dentro do SQL. Só no SELECT e no GROUP BY; o WHERE
 * filtra pelo timestamp cru para usar os índices por `created_at`.
 */
const DAY_KEY = (column: unknown) =>
  sql<string>`to_char((${column} AT TIME ZONE ${sql.raw(`'${BUSINESS_TIME_ZONE}'`)})::date, 'YYYY-MM-DD')`;

/** Scans de gente. */
const HUMAN_SCAN = eq(scansTable.isBot, false);

export interface PeriodInfo {
  days: PortalDays;
  from: string;
  to: string;
}

export function periodInfo(period: PortalPeriod): PeriodInfo {
  return { days: period.days, from: period.keys[0], to: period.keys[period.keys.length - 1] };
}

const playsIn = (period: PortalPeriod) =>
  and(gte(playsTable.createdAt, period.from), lt(playsTable.createdAt, period.to));

const humanScansIn = (period: PortalPeriod) =>
  and(HUMAN_SCAN, gte(scansTable.createdAt, period.from), lt(scansTable.createdAt, period.to));

export interface OverviewTotals {
  plays: number;
  durationSeconds: number;
  scans: number;
  uniqueVisitors: number;
  scanRate: number;
}

async function overviewTotals(period: PortalPeriod): Promise<OverviewTotals> {
  const [plays] = await db
    .select({
      n: sql<number>`COUNT(*)::int`,
      duration: sql<number>`COALESCE(SUM(${playsTable.durationSeconds}), 0)::int`,
    })
    .from(playsTable)
    .where(playsIn(period));

  const [scans] = await db
    .select({
      n: sql<number>`COUNT(*)::int`,
      unique: sql<number>`COUNT(DISTINCT ${scansTable.fingerprint})::int`,
    })
    .from(scansTable)
    .where(humanScansIn(period));

  const totals = {
    plays: plays?.n ?? 0,
    durationSeconds: plays?.duration ?? 0,
    scans: scans?.n ?? 0,
    uniqueVisitors: scans?.unique ?? 0,
  };
  return { ...totals, scanRate: scanRate(totals.scans, totals.plays) };
}

export interface AdminOverview {
  period: PeriodInfo;
  totals: OverviewTotals & { previous: OverviewTotals };
  now: { devices: number; devicesOnline: number; clients: number };
  series: AnalyticsDayPoint[];
}

export async function adminOverview(days: PortalDays, now: Date = new Date()): Promise<AdminOverview> {
  const period = portalPeriod(days, now);
  const previous = previousPortalPeriod(days, now);

  const [current, before] = await Promise.all([overviewTotals(period), overviewTotals(previous)]);

  const playRows = await db
    .select({ day: DAY_KEY(playsTable.createdAt), plays: sql<number>`COUNT(*)::int` })
    .from(playsTable)
    .where(playsIn(period))
    .groupBy(DAY_KEY(playsTable.createdAt));

  const scanRows = await db
    .select({ day: DAY_KEY(scansTable.createdAt), scans: sql<number>`COUNT(*)::int` })
    .from(scansTable)
    .where(humanScansIn(period))
    .groupBy(DAY_KEY(scansTable.createdAt));

  const devices = await db
    .select({ id: devicesTable.id, createdAt: devicesTable.createdAt, lastSeenAt: devicesTable.lastSeenAt })
    .from(devicesTable);

  // Só as sessões que tocam a janela: começaram antes do fim e foram vistas
  // depois do começo.
  const sessions = await db
    .select({
      deviceId: deviceSessionsTable.deviceId,
      startedAt: deviceSessionsTable.startedAt,
      lastSeenAt: deviceSessionsTable.lastSeenAt,
    })
    .from(deviceSessionsTable)
    .where(and(lt(deviceSessionsTable.startedAt, period.to), gte(deviceSessionsTable.lastSeenAt, period.from)));

  // Começo do histórico: o dia SEGUINTE ao dia local da sessão mais antiga.
  // A gravação começou no meio desse dia, então ele é parcial e mostraria uma
  // queda falsa; tratamos como "sem dados", assim como os dias anteriores.
  const [first] = await db
    .select({ startedAt: sql<string | Date | null>`MIN(${deviceSessionsTable.startedAt})` })
    .from(deviceSessionsTable);
  const historyStartKey = first?.startedAt
    ? nextDayKey(businessDayKey(new Date(first.startedAt)))
    : null;

  const [clients] = await db.select({ n: sql<number>`COUNT(*)::int` }).from(clientsTable);

  const availability = dailyAvailability(period.keys, sessions, devices, historyStartKey);

  return {
    period: periodInfo(period),
    totals: { ...current, previous: before },
    now: {
      devices: devices.length,
      devicesOnline: devices.filter((device) => isOnlineAt(device.lastSeenAt, now)).length,
      clients: clients?.n ?? 0,
    },
    series: overviewSeries(period.keys, playRows, scanRows, availability),
  };
}

const RANKING_SIZE = 10;

/** Hora local do negócio, 0–23. */
const HOUR_OF_DAY = sql<number>`EXTRACT(HOUR FROM (${playsTable.createdAt} AT TIME ZONE ${sql.raw(
  `'${BUSINESS_TIME_ZONE}'`,
)}))::int`;

export async function adminHourly(
  days: PortalDays,
  now: Date = new Date(),
): Promise<{ period: PeriodInfo; hours: HourPoint[] }> {
  const period = portalPeriod(days, now);
  const rows = await db
    .select({ hour: HOUR_OF_DAY, plays: sql<number>`COUNT(*)::int` })
    .from(playsTable)
    .where(playsIn(period))
    .groupBy(HOUR_OF_DAY);
  return { period: periodInfo(period), hours: fillHours(rows) };
}

export interface AdminRankings {
  period: PeriodInfo;
  campaigns: Array<{ campaignId: number; name: string; advertiserName: string; plays: number }>;
  devices: Array<{ deviceId: number; name: string; clientName: string; plays: number }>;
  announcements: Array<{
    announcementId: number;
    title: string;
    plays: number;
    scans: number;
    scanRate: number;
    durationSeconds: number;
  }>;
}

const PLAY_COUNT = sql<number>`COUNT(${playsTable.id})::int`;

/**
 * Top 10 por exibições. Empate desempata pelo id para a ordem não mudar entre
 * recarregamentos. Exibição sem campanha (conteúdo fixo da playlist) não entra
 * no ranking de campanhas; entra nos de TVs e peças. Os nomes de anunciante e
 * cliente são `companies.name`, o mesmo da página da empresa.
 */
export async function adminRankings(days: PortalDays, now: Date = new Date()): Promise<AdminRankings> {
  const period = portalPeriod(days, now);

  const campaigns = await db
    .select({
      campaignId: campaignsTable.id,
      name: campaignsTable.name,
      advertiserName: companiesTable.name,
      plays: PLAY_COUNT,
    })
    .from(playsTable)
    .innerJoin(campaignsTable, eq(campaignsTable.id, playsTable.campaignId))
    .innerJoin(advertisersTable, eq(advertisersTable.id, campaignsTable.advertiserId))
    .innerJoin(companiesTable, eq(companiesTable.id, advertisersTable.companyId))
    .where(playsIn(period))
    .groupBy(campaignsTable.id, campaignsTable.name, companiesTable.name)
    .orderBy(desc(PLAY_COUNT), asc(campaignsTable.id))
    .limit(RANKING_SIZE);

  const devices = await db
    .select({
      deviceId: devicesTable.id,
      name: devicesTable.name,
      clientName: companiesTable.name,
      plays: PLAY_COUNT,
    })
    .from(playsTable)
    .innerJoin(devicesTable, eq(devicesTable.id, playsTable.deviceId))
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId))
    .where(playsIn(period))
    .groupBy(devicesTable.id, devicesTable.name, companiesTable.name)
    .orderBy(desc(PLAY_COUNT), asc(devicesTable.id))
    .limit(RANKING_SIZE);

  const topAnnouncements = await db
    .select({
      announcementId: announcementsTable.id,
      title: announcementsTable.title,
      plays: PLAY_COUNT,
      durationSeconds: sql<number>`COALESCE(SUM(${playsTable.durationSeconds}), 0)::int`,
    })
    .from(playsTable)
    .innerJoin(announcementsTable, eq(announcementsTable.id, playsTable.announcementId))
    .where(playsIn(period))
    .groupBy(announcementsTable.id, announcementsTable.title)
    .orderBy(desc(PLAY_COUNT), asc(announcementsTable.id))
    .limit(RANKING_SIZE);

  const ids = topAnnouncements.map((row) => row.announcementId);
  const scanRows =
    ids.length === 0
      ? []
      : await db
          .select({ announcementId: scansTable.announcementId, scans: sql<number>`COUNT(*)::int` })
          .from(scansTable)
          .where(and(humanScansIn(period), inArray(scansTable.announcementId, ids)))
          .groupBy(scansTable.announcementId);
  const scansById = new Map(scanRows.map((row) => [row.announcementId, row.scans]));

  return {
    period: periodInfo(period),
    campaigns,
    devices,
    announcements: topAnnouncements.map((row) => {
      const scans = scansById.get(row.announcementId) ?? 0;
      return { ...row, scans, scanRate: scanRate(scans, row.plays) };
    }),
  };
}
