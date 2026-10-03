import { useState, type ReactNode } from 'react';
import { Clock, Monitor, Percent, Play, QrCode, Users } from 'lucide-react';
import {
  useGetAnalyticsHourly,
  useGetAnalyticsOverview,
  useGetAnalyticsRankings,
} from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ChartConfig } from '@/components/ui/chart';
import { KpiCard } from '@/components/portal/kpi-card';
import { PeriodFilter, type PortalDays } from '@/components/portal/period-filter';
import { TrendChart } from '@/components/portal/trend-chart';
import { formatDelta, formatPointDelta } from '@/components/portal/delta';
import { AvailabilityChart } from '@/components/analytics/availability-chart';
import { HourlyChart } from '@/components/analytics/hourly-chart';
import { RankingList } from '@/components/analytics/ranking-list';
import { AnnouncementsTable } from '@/components/analytics/announcements-table';
import { BlockError } from '@/components/analytics/block-error';

const TREND_CONFIG = {
  plays: { label: 'Exibições', color: 'hsl(var(--chart-1))' },
  scans: { label: 'Scans', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig;

const int = (n: number) => n.toLocaleString('pt-BR');
const rate = (n: number) =>
  `${(n * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="break-inside-avoid">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/**
 * Visão geral da rede. Um período governa a página inteira — cards, gráficos e
 * rankings respondem à mesma pergunta. Cada bloco tem a própria consulta,
 * carga e erro: o ranking fora do ar não apaga os gráficos.
 */
export default function Analytics() {
  const [days, setDays] = useState<PortalDays>(30);
  const params = { days };
  const overview = useGetAnalyticsOverview(params);
  const hourly = useGetAnalyticsHourly(params);
  const rankings = useGetAnalyticsRankings(params);

  // O TrendChart só aceita número/texto; activeDevices pode ser null e não entra neste gráfico.
  const trend = overview.data?.series.map(({ date, plays, scans }) => ({ date, plays, scans }));
  const totals = overview.data?.totals;
  const now = overview.data?.now;
  const noPlays = overview.data ? totals?.plays === 0 : false;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Visão geral</h1>
          <p className="mt-1 text-muted-foreground">Exibições, disponibilidade e destaques da rede no período.</p>
        </div>
        <div className="ml-auto">
          <PeriodFilter value={days} onChange={setDays} />
        </div>
      </div>

      {overview.isError ? (
        <Card className="mb-6">
          <BlockError onRetry={() => overview.refetch()} />
        </Card>
      ) : !totals || !now ? (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="Exibições" value={int(totals.plays)} icon={Play} delta={formatDelta(totals.plays, totals.previous.plays)} />
          <KpiCard
            label="Tempo de exibição"
            value={formatDuration(totals.durationSeconds)}
            icon={Clock}
            delta={formatDelta(totals.durationSeconds, totals.previous.durationSeconds)}
          />
          <KpiCard
            label="Scans"
            value={int(totals.scans)}
            icon={QrCode}
            delta={formatDelta(totals.scans, totals.previous.scans)}
            hint={`${int(totals.uniqueVisitors)} visitantes únicos`}
          />
          <KpiCard
            label="Taxa de scan"
            value={rate(totals.scanRate)}
            icon={Percent}
            delta={formatPointDelta(totals.scanRate, totals.previous.scanRate)}
          />
          <KpiCard label="TVs online agora" value={`${now.devicesOnline} de ${now.devices}`} icon={Monitor} />
          <KpiCard label="Clientes" value={int(now.clients)} icon={Users} />
        </div>
      )}

      {noPlays ? (
        <p className="mb-4 rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Nenhuma exibição no período.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Block title="Exibições e scans por dia">
          {overview.isError ? (
            <BlockError onRetry={() => overview.refetch()} />
          ) : overview.data ? (
            <TrendChart
              data={trend ?? []}
              config={TREND_CONFIG}
              leftKey="plays"
              rightKey="scans"
            />
          ) : (
            <Skeleton className="h-[280px] w-full" />
          )}
        </Block>

        <Block title="TVs que funcionaram por dia">
          {overview.isError ? (
            <BlockError onRetry={() => overview.refetch()} />
          ) : overview.data ? (
            <AvailabilityChart series={overview.data.series} />
          ) : (
            <Skeleton className="h-[240px] w-full" />
          )}
        </Block>

        <Block title="Exibições por horário">
          {hourly.isError ? (
            <BlockError onRetry={() => hourly.refetch()} />
          ) : hourly.data ? (
            <HourlyChart hours={hourly.data.hours} />
          ) : (
            <Skeleton className="h-[240px] w-full" />
          )}
        </Block>

        <Block title="Campanhas">
          {rankings.isError ? (
            <BlockError onRetry={() => rankings.refetch()} />
          ) : rankings.data ? (
            <RankingList
              items={rankings.data.campaigns.map((c) => ({
                key: c.campaignId,
                label: c.name,
                sublabel: c.advertiserName,
                value: c.plays,
                href: `/campaigns/${c.campaignId}`,
              }))}
            />
          ) : (
            <Skeleton className="h-[240px] w-full" />
          )}
        </Block>

        <Block title="TVs">
          {rankings.isError ? (
            <BlockError onRetry={() => rankings.refetch()} />
          ) : rankings.data ? (
            <RankingList
              items={rankings.data.devices.map((d) => ({
                key: d.deviceId,
                label: d.name,
                sublabel: d.clientName,
                value: d.plays,
                href: `/devices/${d.deviceId}`,
              }))}
            />
          ) : (
            <Skeleton className="h-[240px] w-full" />
          )}
        </Block>

        <Block title="Peças">
          {rankings.isError ? (
            <BlockError onRetry={() => rankings.refetch()} />
          ) : rankings.data ? (
            <AnnouncementsTable items={rankings.data.announcements} />
          ) : (
            <Skeleton className="h-[240px] w-full" />
          )}
        </Block>
      </div>
    </div>
  );
}
