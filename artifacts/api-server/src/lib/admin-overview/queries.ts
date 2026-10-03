import { and, eq, gte, lt, sql } from "drizzle-orm";
import { clientsTable, db, devicesTable, deviceSessionsTable, playsTable, scansTable } from "@workspace/db";
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
import { dailyAvailability } from "./availability";
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

  // Começo do histórico: a sessão mais antiga guardada. Antes dela, "sem dados".
  const [first] = await db
    .select({ startedAt: sql<string | Date | null>`MIN(${deviceSessionsTable.startedAt})` })
    .from(deviceSessionsTable);
  const historyStartKey = first?.startedAt ? businessDayKey(new Date(first.startedAt)) : null;

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
