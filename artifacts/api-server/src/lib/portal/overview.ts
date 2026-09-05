// artifacts/api-server/src/lib/portal/overview.ts
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { advertisersTable, clientsTable, db, campaignsTable, devicesTable, playsTable, scansTable } from "@workspace/db";
import { BUSINESS_TIME_ZONE } from "../ad-eligibility";
import { scanRate } from "../scan-rate";
import { fillSeries } from "./series";
import { portalPeriod, previousPortalPeriod, type PortalDays, type PortalPeriod } from "./period";

/**
 * "TVs online agora" é presença, não histórico: cinco minutos é o intervalo
 * em que uma tela saudável reporta. O card diz "agora" e o número precisa
 * concordar com isso, independente do período escolhido no filtro.
 */
export const DEVICE_ONLINE_WINDOW_MINUTES = 5;

export function onlineSince(now: Date): Date {
  return new Date(now.getTime() - DEVICE_ONLINE_WINDOW_MINUTES * 60 * 1000);
}

/**
 * Data local do negócio dentro do SQL, para agrupar a série por dia.
 *
 * `created_at` é `timestamptz`; `AT TIME ZONE` o converte para a hora de
 * parede de São Paulo, e `::date` corta o dia. Esta expressão aparece só no
 * `GROUP BY` e no `SELECT` — nunca no `WHERE`, que filtra pelo timestamp cru
 * para continuar usando os índices compostos.
 */
const DAY_KEY = (column: unknown) =>
  sql<string>`to_char((${column} AT TIME ZONE ${sql.raw(`'${BUSINESS_TIME_ZONE}'`)})::date, 'YYYY-MM-DD')`;

/** Scans de gente. Bot não paga a conta do anunciante. */
const HUMAN_SCAN = eq(scansTable.isBot, false);

/**
 * Nome do anunciante, só quando o vínculo é único.
 *
 * Um usuário pode estar ligado a vários anunciantes, e os totais do overview
 * somam todos eles — "o nome" só é bem definido quando há exatamente um. Com
 * zero ou vários vínculos, a página mantém o título genérico em vez de
 * inventar uma string concatenada.
 */
async function advertiserName(advertiserIds: number[]): Promise<string | null> {
  if (advertiserIds.length !== 1) return null;
  const [row] = await db
    .select({ name: advertisersTable.name })
    .from(advertisersTable)
    .where(eq(advertisersTable.id, advertiserIds[0]));
  return row?.name ?? null;
}

/** Mesma regra de `advertiserName`, para clientes. */
async function clientName(clientIds: number[]): Promise<string | null> {
  if (clientIds.length !== 1) return null;
  const [row] = await db
    .select({ name: clientsTable.name })
    .from(clientsTable)
    .where(eq(clientsTable.id, clientIds[0]));
  return row?.name ?? null;
}

export interface PeriodInfo {
  days: PortalDays;
  from: string;
  to: string;
}

function periodInfo(period: PortalPeriod): PeriodInfo {
  return { days: period.days, from: period.keys[0], to: period.keys[period.keys.length - 1] };
}

export interface AdvertiserTotals {
  plays: number;
  scans: number;
  uniqueVisitors: number;
  scanRate: number;
}

export interface AdvertiserOverview {
  period: PeriodInfo;
  /**
   * Nome do anunciante, só com vínculo único — ver `advertiserName`. `null`
   * quando o usuário tem zero ou vários vínculos; a página cai no título
   * genérico nesse caso.
   */
  subjectName: string | null;
  totals: AdvertiserTotals & {
    reachedDevices: number;
    previous: AdvertiserTotals;
  };
  series: Array<{ date: string; plays: number; scans: number; uniqueVisitors: number }>;
}

const EMPTY_TOTALS: AdvertiserTotals = { plays: 0, scans: 0, uniqueVisitors: 0, scanRate: 0 };

async function advertiserTotals(
  advertiserIds: number[],
  period: PortalPeriod,
): Promise<AdvertiserTotals> {
  const [plays] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(playsTable)
    .innerJoin(campaignsTable, eq(campaignsTable.id, playsTable.campaignId))
    .where(
      and(
        inArray(campaignsTable.advertiserId, advertiserIds),
        gte(playsTable.createdAt, period.from),
        lt(playsTable.createdAt, period.to),
      ),
    );

  const [scans] = await db
    .select({
      n: sql<number>`COUNT(*)::int`,
      unique: sql<number>`COUNT(DISTINCT ${scansTable.fingerprint})::int`,
    })
    .from(scansTable)
    .innerJoin(campaignsTable, eq(campaignsTable.id, scansTable.campaignId))
    .where(
      and(
        inArray(campaignsTable.advertiserId, advertiserIds),
        HUMAN_SCAN,
        gte(scansTable.createdAt, period.from),
        lt(scansTable.createdAt, period.to),
      ),
    );

  const totals = {
    plays: plays?.n ?? 0,
    scans: scans?.n ?? 0,
    uniqueVisitors: scans?.unique ?? 0,
  };
  return { ...totals, scanRate: scanRate(totals.scans, totals.plays) };
}

export async function advertiserOverview(
  advertiserIds: number[],
  days: PortalDays,
  now: Date = new Date(),
): Promise<AdvertiserOverview> {
  const period = portalPeriod(days, now);
  const previous = previousPortalPeriod(days, now);

  // Admin abrindo o portal não tem vínculo: devolve a casca vazia em vez de
  // uma varredura sem filtro, que traria a rede inteira.
  if (advertiserIds.length === 0) {
    return {
      period: periodInfo(period),
      subjectName: null,
      totals: { ...EMPTY_TOTALS, reachedDevices: 0, previous: EMPTY_TOTALS },
      series: fillSeries(period.keys, [], ["plays", "scans", "uniqueVisitors"]),
    };
  }

  const [current, before, subjectName] = await Promise.all([
    advertiserTotals(advertiserIds, period),
    advertiserTotals(advertiserIds, previous),
    advertiserName(advertiserIds),
  ]);

  const [devices] = await db
    .select({ n: sql<number>`COUNT(DISTINCT ${playsTable.deviceId})::int` })
    .from(playsTable)
    .innerJoin(campaignsTable, eq(campaignsTable.id, playsTable.campaignId))
    .where(
      and(
        inArray(campaignsTable.advertiserId, advertiserIds),
        gte(playsTable.createdAt, period.from),
        lt(playsTable.createdAt, period.to),
      ),
    );

  const playRows = await db
    .select({ day: DAY_KEY(playsTable.createdAt), plays: sql<number>`COUNT(*)::int` })
    .from(playsTable)
    .innerJoin(campaignsTable, eq(campaignsTable.id, playsTable.campaignId))
    .where(
      and(
        inArray(campaignsTable.advertiserId, advertiserIds),
        gte(playsTable.createdAt, period.from),
        lt(playsTable.createdAt, period.to),
      ),
    )
    .groupBy(DAY_KEY(playsTable.createdAt));

  const scanRows = await db
    .select({
      day: DAY_KEY(scansTable.createdAt),
      scans: sql<number>`COUNT(*)::int`,
      uniqueVisitors: sql<number>`COUNT(DISTINCT ${scansTable.fingerprint})::int`,
    })
    .from(scansTable)
    .innerJoin(campaignsTable, eq(campaignsTable.id, scansTable.campaignId))
    .where(
      and(
        inArray(campaignsTable.advertiserId, advertiserIds),
        HUMAN_SCAN,
        gte(scansTable.createdAt, period.from),
        lt(scansTable.createdAt, period.to),
      ),
    )
    .groupBy(DAY_KEY(scansTable.createdAt));

  const scansByDay = new Map(scanRows.map((row) => [row.day, row]));
  const merged = playRows.map((row) => ({
    day: row.day,
    plays: row.plays,
    scans: scansByDay.get(row.day)?.scans ?? 0,
    uniqueVisitors: scansByDay.get(row.day)?.uniqueVisitors ?? 0,
  }));
  // Dia com scan e sem play existe: o QR foi lido depois que a campanha saiu do ar.
  for (const row of scanRows) {
    if (!playRows.some((play) => play.day === row.day)) {
      merged.push({ day: row.day, plays: 0, scans: row.scans, uniqueVisitors: row.uniqueVisitors });
    }
  }

  return {
    period: periodInfo(period),
    subjectName,
    totals: {
      ...current,
      reachedDevices: devices?.n ?? 0,
      previous: before,
    },
    series: fillSeries(period.keys, merged, ["plays", "scans", "uniqueVisitors"]),
  };
}

export interface ClientOverview {
  period: PeriodInfo;
  /** Nome do cliente, só com vínculo único — mesma regra de `AdvertiserOverview.subjectName`. */
  subjectName: string | null;
  totals: { plays: number; devices: number; devicesOnline: number; previous: { plays: number } };
  series: Array<{ date: string; plays: number }>;
}

async function clientPlays(clientIds: number[], period: PortalPeriod): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(playsTable)
    .innerJoin(devicesTable, eq(devicesTable.id, playsTable.deviceId))
    .where(
      and(
        inArray(devicesTable.clientId, clientIds),
        gte(playsTable.createdAt, period.from),
        lt(playsTable.createdAt, period.to),
      ),
    );
  return row?.n ?? 0;
}

export async function clientOverview(
  clientIds: number[],
  days: PortalDays,
  now: Date = new Date(),
): Promise<ClientOverview> {
  const period = portalPeriod(days, now);
  const previous = previousPortalPeriod(days, now);

  if (clientIds.length === 0) {
    return {
      period: periodInfo(period),
      subjectName: null,
      totals: { plays: 0, devices: 0, devicesOnline: 0, previous: { plays: 0 } },
      series: fillSeries(period.keys, [], ["plays"]),
    };
  }

  const [plays, playsBefore, subjectName] = await Promise.all([
    clientPlays(clientIds, period),
    clientPlays(clientIds, previous),
    clientName(clientIds),
  ]);

  // lastSeenAt nulo não satisfaz o gte: TV cadastrada que nunca reportou não
  // conta como online.
  const [devices] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      online: sql<number>`COUNT(*) FILTER (WHERE ${devicesTable.lastSeenAt} >= ${onlineSince(now)})::int`,
    })
    .from(devicesTable)
    .where(inArray(devicesTable.clientId, clientIds));

  const rows = await db
    .select({ day: DAY_KEY(playsTable.createdAt), plays: sql<number>`COUNT(*)::int` })
    .from(playsTable)
    .innerJoin(devicesTable, eq(devicesTable.id, playsTable.deviceId))
    .where(
      and(
        inArray(devicesTable.clientId, clientIds),
        gte(playsTable.createdAt, period.from),
        lt(playsTable.createdAt, period.to),
      ),
    )
    .groupBy(DAY_KEY(playsTable.createdAt));

  return {
    period: periodInfo(period),
    subjectName,
    totals: {
      plays,
      devices: devices?.total ?? 0,
      devicesOnline: devices?.online ?? 0,
      previous: { plays: playsBefore },
    },
    series: fillSeries(period.keys, rows, ["plays"]),
  };
}
