import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import {
  announcementsTable,
  advertisersTable,
  campaignAnnouncementsTable,
  campaignsTable,
  clientsTable,
  companiesTable,
  db,
  deviceSessionsTable,
  devicesTable,
  playsTable,
  scansTable,
} from "@workspace/db";
import { countReachedDevices } from "../ad-eligibility";
import { fillHours, type HourPoint } from "../admin-overview/hours";
import { historyStartKey } from "../admin-overview/history";
import { isOnlineAt } from "../device-presence";
import { scanRate } from "../scan-rate";
import { dayKeySql, hourOfDaySql } from "../sql-time";
import { campaignWindow, type CampaignStatus } from "./campaign-window";
import { countOnlineDays, deviceOnlineDays } from "./device-days";
import { businessDayKey, portalPeriod, previousPortalPeriod, type PortalDays } from "./period";
import { campaignTargetColumns, loadNetwork } from "./queries";
import { fillSeries } from "./series";

const PLAY_COUNT = sql<number>`COUNT(${playsTable.id})::int`;

/** Dono da campanha, para a rota conferir o escopo antes de qualquer cálculo. */
export async function campaignOwner(campaignId: number): Promise<number | null> {
  const [row] = await db
    .select({ advertiserId: campaignsTable.advertiserId })
    .from(campaignsTable)
    .where(eq(campaignsTable.id, campaignId));
  return row?.advertiserId ?? null;
}

export interface CampaignReport {
  campaign: { id: number; name: string; startsAt: Date; endsAt: Date; isActive: boolean; status: CampaignStatus };
  period: { from: string; to: string };
  totals: {
    plays: number;
    durationSeconds: number;
    devicesPlayed: number;
    devicesTargeted: number;
    stores: number;
    scans: number;
    uniqueVisitors: number;
    scanRate: number;
  };
  series: Array<{ date: string; plays: number; scans: number }>;
  hours: HourPoint[];
  devices: Array<{
    deviceId: number;
    storeName: string;
    deviceName: string;
    location: string | null;
    plays: number;
    firstPlayedAt: Date;
    lastPlayedAt: Date;
  }>;
  announcements: Array<{ announcementId: number; title: string; plays: number; scans: number; scanRate: number }>;
}

/**
 * Comprovante da campanha: o contrato inteiro (ou até agora). NUNCA expõe
 * `contractValue`. `null` se a campanha não existe — a rota já conferiu o
 * dono antes.
 */
export async function campaignReport(campaignId: number, now: Date = new Date()): Promise<CampaignReport | null> {
  const [row] = await db
    .select({
      id: campaignsTable.id,
      name: campaignsTable.name,
      startsAt: campaignsTable.startsAt,
      endsAt: campaignsTable.endsAt,
      isActive: campaignsTable.isActive,
      ...campaignTargetColumns,
    })
    .from(campaignsTable)
    .innerJoin(advertisersTable, eq(advertisersTable.id, campaignsTable.advertiserId))
    .innerJoin(companiesTable, eq(companiesTable.id, advertisersTable.companyId))
    .where(eq(campaignsTable.id, campaignId));
  if (!row) return null;

  const { targetMode, deviceIds, segmentIds, advertiserSegmentId, advertiserCompanyId, ...campaignRow } = row;
  const window = campaignWindow(row.startsAt, row.endsAt, now);
  const campaign = { ...campaignRow, status: window.status };
  const devicesTargeted = countReachedDevices(
    { targetMode, deviceIds, segmentIds, advertiserSegmentId, advertiserCompanyId },
    await loadNetwork(),
  );

  if (window.status === "agendada") {
    const startKey = businessDayKey(row.startsAt);
    return {
      campaign,
      period: { from: startKey, to: startKey },
      totals: {
        plays: 0, durationSeconds: 0, devicesPlayed: 0, devicesTargeted, stores: 0,
        scans: 0, uniqueVisitors: 0, scanRate: 0,
      },
      series: [],
      hours: fillHours([]),
      devices: [],
      announcements: [],
    };
  }

  const playsWhere = and(
    eq(playsTable.campaignId, campaignId),
    gte(playsTable.createdAt, window.from),
    lt(playsTable.createdAt, window.to),
  );
  // Bot fica fora: anunciante não paga para ver crawler.
  const scansWhere = and(
    eq(scansTable.campaignId, campaignId),
    eq(scansTable.isBot, false),
    gte(scansTable.createdAt, window.from),
    lt(scansTable.createdAt, window.to),
  );

  const [playTotals] = await db
    .select({ n: PLAY_COUNT, duration: sql<number>`COALESCE(SUM(${playsTable.durationSeconds}), 0)::int` })
    .from(playsTable)
    .where(playsWhere);

  const [scanTotals] = await db
    .select({ n: sql<number>`COUNT(*)::int`, unique: sql<number>`COUNT(DISTINCT ${scansTable.fingerprint})::int` })
    .from(scansTable)
    .where(scansWhere);

  const playDays = await db
    .select({ day: dayKeySql(playsTable.createdAt), plays: PLAY_COUNT })
    .from(playsTable)
    .where(playsWhere)
    .groupBy(dayKeySql(playsTable.createdAt));

  const scanDays = await db
    .select({ day: dayKeySql(scansTable.createdAt), scans: sql<number>`COUNT(*)::int` })
    .from(scansTable)
    .where(scansWhere)
    .groupBy(dayKeySql(scansTable.createdAt));

  const hourRows = await db
    .select({ hour: hourOfDaySql(playsTable.createdAt), plays: PLAY_COUNT })
    .from(playsTable)
    .where(playsWhere)
    .groupBy(hourOfDaySql(playsTable.createdAt));

  // Todas as TVs que exibiram — é o comprovante, sem corte em top 10.
  const deviceRows = await db
    .select({
      deviceId: devicesTable.id,
      clientId: devicesTable.clientId,
      storeName: companiesTable.name,
      deviceName: devicesTable.name,
      location: devicesTable.location,
      plays: PLAY_COUNT,
      firstPlayedAt: sql<Date>`MIN(${playsTable.createdAt})`,
      lastPlayedAt: sql<Date>`MAX(${playsTable.createdAt})`,
    })
    .from(playsTable)
    .innerJoin(devicesTable, eq(devicesTable.id, playsTable.deviceId))
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId))
    .where(playsWhere)
    .groupBy(devicesTable.id, devicesTable.clientId, companiesTable.name, devicesTable.name, devicesTable.location)
    .orderBy(desc(PLAY_COUNT), asc(devicesTable.id));

  // Peças: as ligadas à campanha hoje E as que exibiram na janela — uma peça
  // trocada no meio da campanha continua no comprovante, e a soma das linhas
  // bate com o total.
  const linked = await db
    .select({ announcementId: announcementsTable.id, title: announcementsTable.title })
    .from(campaignAnnouncementsTable)
    .innerJoin(announcementsTable, eq(announcementsTable.id, campaignAnnouncementsTable.announcementId))
    .where(eq(campaignAnnouncementsTable.campaignId, campaignId));

  const playedPieces = await db
    .select({ announcementId: announcementsTable.id, title: announcementsTable.title, plays: PLAY_COUNT })
    .from(playsTable)
    .innerJoin(announcementsTable, eq(announcementsTable.id, playsTable.announcementId))
    .where(playsWhere)
    .groupBy(announcementsTable.id, announcementsTable.title);

  const scannedPieces = await db
    .select({ announcementId: scansTable.announcementId, scans: sql<number>`COUNT(*)::int` })
    .from(scansTable)
    .where(scansWhere)
    .groupBy(scansTable.announcementId);
  const scansByPiece = new Map(scannedPieces.map((piece) => [piece.announcementId, piece.scans]));

  const pieces = new Map<number, { announcementId: number; title: string; plays: number }>();
  for (const piece of linked) pieces.set(piece.announcementId, { ...piece, plays: 0 });
  for (const piece of playedPieces) pieces.set(piece.announcementId, piece);
  const announcements = [...pieces.values()]
    .map((piece) => {
      const scans = scansByPiece.get(piece.announcementId) ?? 0;
      return { ...piece, scans, scanRate: scanRate(scans, piece.plays) };
    })
    .sort((a, b) => b.plays - a.plays || a.announcementId - b.announcementId);

  const plays = fillSeries(window.keys, playDays, ["plays"]);
  const scans = fillSeries(window.keys, scanDays, ["scans"]);

  const totals = {
    plays: playTotals?.n ?? 0,
    durationSeconds: playTotals?.duration ?? 0,
    devicesPlayed: deviceRows.length,
    devicesTargeted,
    stores: new Set(deviceRows.map((device) => device.clientId)).size,
    scans: scanTotals?.n ?? 0,
    uniqueVisitors: scanTotals?.unique ?? 0,
    scanRate: 0,
  };
  totals.scanRate = scanRate(totals.scans, totals.plays);

  return {
    campaign,
    period: { from: window.keys[0], to: window.keys[window.keys.length - 1] },
    totals,
    series: window.keys.map((date, index) => ({ date, plays: plays[index].plays, scans: scans[index].scans })),
    hours: fillHours(hourRows),
    devices: deviceRows.map(({ clientId, ...device }) => ({
      ...device,
      firstPlayedAt: new Date(device.firstPlayedAt),
      lastPlayedAt: new Date(device.lastPlayedAt),
    })),
    announcements,
  };
}

/** Loja dona da TV, para a rota conferir o escopo antes de qualquer cálculo. */
export async function deviceOwner(deviceId: number): Promise<number | null> {
  const [row] = await db.select({ clientId: devicesTable.clientId }).from(devicesTable).where(eq(devicesTable.id, deviceId));
  return row?.clientId ?? null;
}

export interface DeviceReport {
  device: { id: number; name: string; location: string | null; isOnline: boolean };
  period: { days: PortalDays; from: string; to: string };
  totals: { plays: number; durationSeconds: number; daysOnline: number; daysWithHistory: number; previous: { plays: number } };
  series: Array<{ date: string; plays: number; online: boolean | null }>;
  hours: HourPoint[];
  campaigns: Array<{ campaignId: number | null; campaignName: string | null; advertiserName: string | null; plays: number }>;
}

/** O que a TV fez no período: se ficou no ar e o que passou nela. */
export async function deviceReport(deviceId: number, days: PortalDays, now: Date = new Date()): Promise<DeviceReport | null> {
  const [device] = await db
    .select({
      id: devicesTable.id,
      name: devicesTable.name,
      location: devicesTable.location,
      lastSeenAt: devicesTable.lastSeenAt,
      createdAt: devicesTable.createdAt,
    })
    .from(devicesTable)
    .where(eq(devicesTable.id, deviceId));
  if (!device) return null;

  const period = portalPeriod(days, now);
  const previous = previousPortalPeriod(days, now);
  const playsIn = (from: Date, to: Date) =>
    and(eq(playsTable.deviceId, deviceId), gte(playsTable.createdAt, from), lt(playsTable.createdAt, to));
  const current = playsIn(period.from, period.to);

  const [totals] = await db
    .select({ n: PLAY_COUNT, duration: sql<number>`COALESCE(SUM(${playsTable.durationSeconds}), 0)::int` })
    .from(playsTable)
    .where(current);
  const [before] = await db.select({ n: PLAY_COUNT }).from(playsTable).where(playsIn(previous.from, previous.to));

  const playDays = await db
    .select({ day: dayKeySql(playsTable.createdAt), plays: PLAY_COUNT })
    .from(playsTable)
    .where(current)
    .groupBy(dayKeySql(playsTable.createdAt));

  const hourRows = await db
    .select({ hour: hourOfDaySql(playsTable.createdAt), plays: PLAY_COUNT })
    .from(playsTable)
    .where(current)
    .groupBy(hourOfDaySql(playsTable.createdAt));

  const sessions = await db
    .select({ startedAt: deviceSessionsTable.startedAt, lastSeenAt: deviceSessionsTable.lastSeenAt })
    .from(deviceSessionsTable)
    .where(
      and(
        eq(deviceSessionsTable.deviceId, deviceId),
        lt(deviceSessionsTable.startedAt, period.to),
        gte(deviceSessionsTable.lastSeenAt, period.from),
      ),
    );

  // Conteúdo sem campanha (playlist e encartes da loja) cai na linha de
  // campanha nula: LEFT JOIN, para ele não sumir do total.
  const campaigns = await db
    .select({
      campaignId: playsTable.campaignId,
      campaignName: campaignsTable.name,
      advertiserName: companiesTable.name,
      plays: PLAY_COUNT,
    })
    .from(playsTable)
    .leftJoin(campaignsTable, eq(campaignsTable.id, playsTable.campaignId))
    .leftJoin(advertisersTable, eq(advertisersTable.id, campaignsTable.advertiserId))
    .leftJoin(companiesTable, eq(companiesTable.id, advertisersTable.companyId))
    .where(current)
    .groupBy(playsTable.campaignId, campaignsTable.name, companiesTable.name)
    .orderBy(desc(PLAY_COUNT), sql`${playsTable.campaignId} ASC NULLS LAST`);

  const onlineDays = deviceOnlineDays(period.keys, sessions, device, await historyStartKey());
  const plays = fillSeries(period.keys, playDays, ["plays"]);

  return {
    device: { id: device.id, name: device.name, location: device.location, isOnline: isOnlineAt(device.lastSeenAt, now) },
    period: { days, from: period.keys[0], to: period.keys[period.keys.length - 1] },
    totals: {
      plays: totals?.n ?? 0,
      durationSeconds: totals?.duration ?? 0,
      ...countOnlineDays(onlineDays),
      previous: { plays: before?.n ?? 0 },
    },
    series: period.keys.map((date, index) => ({ date, plays: plays[index].plays, online: onlineDays[index].online })),
    hours: fillHours(hourRows),
    campaigns,
  };
}
