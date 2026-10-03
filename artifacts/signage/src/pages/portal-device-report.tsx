import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { CalendarCheck, Clock, Play } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ChartConfig } from '@/components/ui/chart';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/portal/kpi-card';
import { PeriodFilter, type PortalDays } from '@/components/portal/period-filter';
import { PrintHeader } from '@/components/portal/print-header';
import { TrendChart } from '@/components/portal/trend-chart';
import { formatDelta } from '@/components/portal/delta';
import { OnlineDaysStrip } from '@/components/portal/online-days-strip';
import { DeviceCampaignsTable, type DeviceCampaignRow } from '@/components/portal/device-campaigns-table';
import { HourlyChart } from '@/components/analytics/hourly-chart';
import { BlockError } from '@/components/analytics/block-error';

interface DeviceReport {
  device: { id: number; name: string; location: string | null; isOnline: boolean };
  period: { days: PortalDays; from: string; to: string };
  totals: { plays: number; durationSeconds: number; daysOnline: number; daysWithHistory: number; previous: { plays: number } };
  series: Array<{ date: string; plays: number; online: boolean | null }>;
  hours: Array<{ hour: number; plays: number }>;
  campaigns: DeviceCampaignRow[];
}

/** Erro com o status: 404 (TV de outra loja ou inexistente) tem tela própria. */
class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

async function getReport(id: number, days: PortalDays): Promise<DeviceReport> {
  const res = await fetch(`${import.meta.env.BASE_URL}api/portal/client/devices/${id}/report?days=${days}`);
  if (!res.ok) throw new HttpError(res.status);
  return res.json();
}

const CHART_CONFIG = { plays: { label: 'Exibições', color: 'hsl(var(--chart-1))' } } satisfies ChartConfig;
const int = (n: number) => n.toLocaleString('pt-BR');

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

/** O que a TV da loja fez no período: se ficou no ar e o que passou nela. */
export default function PortalDeviceReport({ id }: { id: number }) {
  const [days, setDays] = useState<PortalDays>(30);
  const report = useQuery({
    queryKey: ['portal', 'client', 'device-report', id, days],
    queryFn: () => getReport(id, days),
    retry: false,
  });

  if (report.error instanceof HttpError && report.error.status === 404) {
    return (
      <div className="py-12 text-center">
        <p className="text-lg font-medium">TV não encontrada</p>
        <Link href="/portal/tvs" className="mt-2 inline-block text-sm text-primary underline-offset-4 hover:underline">
          Voltar para Minhas TVs
        </Link>
      </div>
    );
  }
  if (report.isError) return <BlockError onRetry={() => report.refetch()} />;
  if (!report.data) return <Skeleton className="h-96 w-full rounded-xl" />;

  const { device, period, totals } = report.data;

  return (
    <div>
      <PrintHeader subject={`TV ${device.name}`} period={period} />
      <div className="print:hidden">
        <PageHeader trail={[{ label: 'Minhas TVs', href: '/portal/tvs' }, { label: device.name }]} />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold print:hidden">{device.name}</h1>
          <p className="text-sm text-muted-foreground">{device.location ?? 'Sem local'}</p>
        </div>
        <Badge variant={device.isOnline ? 'default' : 'secondary'}>{device.isOnline ? 'Online agora' : 'Offline agora'}</Badge>
        <div className="ml-auto flex items-center gap-2">
          <PeriodFilter value={days} onChange={setDays} />
          <Button variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
            Imprimir / PDF
          </Button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <KpiCard label="Exibições" value={int(totals.plays)} icon={Play} delta={formatDelta(totals.plays, totals.previous.plays)} />
        <KpiCard label="Dias em que funcionou" value={`${totals.daysOnline} de ${totals.daysWithHistory}`} icon={CalendarCheck} />
        <KpiCard label="Tempo de exibição" value={formatDuration(totals.durationSeconds)} icon={Clock} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="break-inside-avoid">
          <CardHeader><CardTitle>Exibições por dia</CardTitle></CardHeader>
          <CardContent>
            <TrendChart data={report.data.series.map(({ date, plays }) => ({ date, plays }))} config={CHART_CONFIG} leftKey="plays" />
          </CardContent>
        </Card>
        <Card className="break-inside-avoid">
          <CardHeader><CardTitle>Dias no ar</CardTitle></CardHeader>
          <CardContent>
            <OnlineDaysStrip days={report.data.series.map(({ date, online }) => ({ date, online }))} />
          </CardContent>
        </Card>
        <Card className="break-inside-avoid">
          <CardHeader><CardTitle>Exibições por horário</CardTitle></CardHeader>
          <CardContent><HourlyChart hours={report.data.hours} /></CardContent>
        </Card>
        <Card className="break-inside-avoid">
          <CardHeader><CardTitle>O que passou</CardTitle></CardHeader>
          <CardContent><DeviceCampaignsTable items={report.data.campaigns} /></CardContent>
        </Card>
      </div>
    </div>
  );
}
