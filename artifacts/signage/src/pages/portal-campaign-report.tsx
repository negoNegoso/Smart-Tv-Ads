import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Clock, MapPin, Monitor, Percent, Play, QrCode, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ChartConfig } from '@/components/ui/chart';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/portal/kpi-card';
import { PrintHeader } from '@/components/portal/print-header';
import { TrendChart } from '@/components/portal/trend-chart';
import { WherePlayedTable, type WherePlayedRow } from '@/components/portal/where-played-table';
import { CampaignPiecesTable, type PieceRow } from '@/components/portal/campaign-pieces-table';
import { HourlyChart } from '@/components/analytics/hourly-chart';
import { BlockError } from '@/components/analytics/block-error';

interface CampaignReport {
  campaign: { id: number; name: string; startsAt: string; endsAt: string; isActive: boolean; status: 'agendada' | 'no_ar' | 'encerrada' };
  period: { from: string; to: string };
  totals: {
    plays: number; durationSeconds: number; devicesPlayed: number; devicesTargeted: number; stores: number;
    scans: number; uniqueVisitors: number; scanRate: number;
  };
  series: Array<{ date: string; plays: number; scans: number }>;
  hours: Array<{ hour: number; plays: number }>;
  devices: WherePlayedRow[];
  announcements: PieceRow[];
}

/** Erro com o status: 404 (campanha de outro anunciante ou inexistente) tem tela própria. */
class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

async function getReport(id: number): Promise<CampaignReport> {
  const res = await fetch(`${import.meta.env.BASE_URL}api/portal/advertiser/campaigns/${id}/report`);
  if (!res.ok) throw new HttpError(res.status);
  return res.json();
}

const CHART_CONFIG = { plays: { label: 'Exibições', color: 'hsl(var(--chart-1))' } } satisfies ChartConfig;
const int = (n: number) => n.toLocaleString('pt-BR');
const rate = (n: number) =>
  `${(n * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const fullDate = (key: string) => key.split('-').reverse().join('/');

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

const STATUS = { agendada: 'Agendada', no_ar: 'No ar', encerrada: 'Encerrada' } as const;

/**
 * Comprovante da campanha: o contrato inteiro. Primeiro a prova de veiculação
 * (onde e quando passou), depois o resultado (qual peça respondeu). Impresso,
 * sai com o cabeçalho de período e data de emissão.
 */
export default function PortalCampaignReport({ id }: { id: number }) {
  const report = useQuery({
    queryKey: ['portal', 'advertiser', 'campaign-report', id],
    queryFn: () => getReport(id),
    retry: false,
  });

  if (report.error instanceof HttpError && report.error.status === 404) {
    return (
      <div className="py-12 text-center">
        <p className="text-lg font-medium">Campanha não encontrada</p>
        <Link href="/portal/anunciante" className="mt-2 inline-block text-sm text-primary underline-offset-4 hover:underline">
          Voltar para Desempenho
        </Link>
      </div>
    );
  }
  if (report.isError) return <BlockError onRetry={() => report.refetch()} />;
  if (!report.data) return <Skeleton className="h-96 w-full rounded-xl" />;

  const { campaign, period, totals } = report.data;
  const periodText =
    campaign.status === 'no_ar'
      ? `desde ${fullDate(period.from)} · no ar`
      : `${fullDate(period.from)} a ${fullDate(period.to)}`;

  return (
    <div>
      <PrintHeader subject={`Campanha ${campaign.name}`} period={period} />
      <div className="print:hidden">
        <PageHeader trail={[{ label: 'Desempenho', href: '/portal/anunciante' }, { label: campaign.name }]} />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold print:hidden">{campaign.name}</h1>
          <p className="text-sm text-muted-foreground">{periodText}</p>
        </div>
        <Badge variant={campaign.status === 'no_ar' ? 'default' : 'secondary'}>{STATUS[campaign.status]}</Badge>
        <Button variant="outline" size="sm" className="ml-auto print:hidden" onClick={() => window.print()}>
          Imprimir / PDF
        </Button>
      </div>

      {campaign.status === 'agendada' ? (
        <p className="rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          A campanha começa em {fullDate(period.from)}.
        </p>
      ) : (
        <>
          <h2 className="mb-3 text-lg font-semibold">Veiculação</h2>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard label="Exibições no contrato" value={int(totals.plays)} icon={Play} />
            <KpiCard label="Tempo de exibição" value={formatDuration(totals.durationSeconds)} icon={Clock} />
            <KpiCard label="TVs que exibiram" value={`${totals.devicesPlayed} de ${totals.devicesTargeted} no alvo`} icon={Monitor} />
            <KpiCard label="Lojas" value={int(totals.stores)} icon={MapPin} />
          </div>

          <Card className="mb-6 break-inside-avoid">
            <CardHeader><CardTitle>Exibições por dia</CardTitle></CardHeader>
            <CardContent>
              <TrendChart data={report.data.series.map(({ date, plays }) => ({ date, plays }))} config={CHART_CONFIG} leftKey="plays" />
            </CardContent>
          </Card>

          <Card className="mb-8">
            <CardHeader><CardTitle>Onde passou</CardTitle></CardHeader>
            <CardContent><WherePlayedTable items={report.data.devices} /></CardContent>
          </Card>

          <h2 className="mb-3 text-lg font-semibold">Resultado</h2>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
            <KpiCard label="Scans" value={int(totals.scans)} icon={QrCode} />
            <KpiCard label="Visitantes únicos" value={int(totals.uniqueVisitors)} icon={Users} />
            <KpiCard label="Taxa de resposta" value={rate(totals.scanRate)} icon={Percent} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="break-inside-avoid">
              <CardHeader><CardTitle>Peças</CardTitle></CardHeader>
              <CardContent><CampaignPiecesTable items={report.data.announcements} /></CardContent>
            </Card>
            <Card className="break-inside-avoid">
              <CardHeader><CardTitle>Exibições por horário</CardTitle></CardHeader>
              <CardContent><HourlyChart hours={report.data.hours} /></CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
