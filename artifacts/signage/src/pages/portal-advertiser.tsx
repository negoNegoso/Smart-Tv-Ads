import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Play, QrCode, Users, Percent } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import type { ChartConfig } from '@/components/ui/chart';
import { KpiCard } from '@/components/portal/kpi-card';
import { PeriodFilter, type PortalDays } from '@/components/portal/period-filter';
import { PrintHeader } from '@/components/portal/print-header';
import { TrendChart } from '@/components/portal/trend-chart';
import { formatDelta, formatPointDelta } from '@/components/portal/delta';

interface PortalCampaign {
  id: number;
  name: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  deviceCount: number;
  totalPlays: number;
  totalScans: number;
  uniqueVisitors: number;
}

interface AdvertiserTotals {
  plays: number;
  scans: number;
  uniqueVisitors: number;
  scanRate: number;
}

interface AdvertiserOverview {
  period: { days: PortalDays; from: string; to: string };
  totals: AdvertiserTotals & {
    activeCampaigns: number;
    reachedDevices: number;
    previous: AdvertiserTotals;
  };
  series: Array<{ date: string; plays: number; scans: number; uniqueVisitors: number }>;
}

/**
 * Erro de rede não pode virar lista vazia.
 *
 * A versão anterior fazia `if (!res.ok) return []`, então API fora do ar e
 * anunciante sem campanha desenhavam exatamente a mesma tela — e quem paga por
 * veiculação lê "nenhuma campanha" como "minha campanha sumiu".
 */
async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}${path}`);
  if (!res.ok) throw new Error(`Falha ao carregar ${path}: ${res.status}`);
  return res.json();
}

const CHART_CONFIG = {
  plays: { label: 'Exibições', color: 'hsl(var(--chart-1))' },
  scans: { label: 'Scans', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig;

const int = (n: number) => n.toLocaleString('pt-BR');
const rate = (n: number) =>
  `${(n * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const day = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

export default function PortalAdvertiser() {
  const [days, setDays] = useState<PortalDays>(30);

  const overview = useQuery({
    queryKey: ['portal', 'advertiser', 'overview', days],
    queryFn: () => getJson<AdvertiserOverview>(`api/portal/advertiser/overview?days=${days}`),
    retry: false,
  });

  const campaigns = useQuery({
    queryKey: ['portal', 'advertiser', 'campaigns', days],
    queryFn: () => getJson<PortalCampaign[]>(`api/portal/advertiser/campaigns?days=${days}`),
    retry: false,
  });

  if (overview.isError || campaigns.isError) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Não foi possível carregar seus dados</EmptyTitle>
          <EmptyDescription>
            O servidor não respondeu. Suas campanhas continuam no ar — isto é uma falha de leitura.
          </EmptyDescription>
        </EmptyHeader>
        <Button
          onClick={() => {
            overview.refetch();
            campaigns.refetch();
          }}
        >
          Tentar de novo
        </Button>
      </Empty>
    );
  }

  const totals = overview.data?.totals;
  const previous = totals?.previous;
  const period = overview.data?.period;

  return (
    <div>
      {period ? <PrintHeader subject="Minhas campanhas" period={period} /> : null}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold print:hidden">Minhas campanhas</h1>
        <div className="ml-auto flex items-center gap-2">
          <PeriodFilter value={days} onChange={setDays} />
          <Button variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
            Imprimir / PDF
          </Button>
        </div>
      </div>

      {overview.isLoading || !totals || !previous ? (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard
            label="Exibições"
            value={int(totals.plays)}
            icon={Play}
            delta={formatDelta(totals.plays, previous.plays)}
            hint={`${int(totals.reachedDevices)} TVs alcançadas`}
          />
          <KpiCard
            label="Scans"
            value={int(totals.scans)}
            icon={QrCode}
            delta={formatDelta(totals.scans, previous.scans)}
          />
          <KpiCard
            label="Visitantes únicos"
            value={int(totals.uniqueVisitors)}
            icon={Users}
            delta={formatDelta(totals.uniqueVisitors, previous.uniqueVisitors)}
          />
          <KpiCard
            label="Taxa de resposta"
            value={rate(totals.scanRate)}
            icon={Percent}
            delta={formatPointDelta(totals.scanRate, previous.scanRate)}
          />
        </div>
      )}

      <Card className="mb-6 break-inside-avoid">
        <CardHeader>
          <CardTitle>Exibições e scans por dia</CardTitle>
        </CardHeader>
        <CardContent>
          {overview.isLoading || !overview.data ? (
            <Skeleton className="h-[280px] w-full rounded-lg" />
          ) : (
            <TrendChart
              data={overview.data.series}
              config={CHART_CONFIG}
              leftKey="plays"
              rightKey="scans"
            />
          )}
        </CardContent>
      </Card>

      <Card className="break-inside-avoid">
        <CardHeader>
          <CardTitle>Campanhas no período</CardTitle>
        </CardHeader>
        <CardContent>
          {campaigns.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !campaigns.data?.length ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Nenhuma campanha encontrada</EmptyTitle>
                <EmptyDescription>
                  Quando uma campanha sua entrar no ar, ela aparece aqui.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-muted-foreground">
                  <tr>
                    <th className="py-2 font-medium">Campanha</th>
                    <th className="py-2 font-medium">Período</th>
                    <th className="py-2 font-medium">Status</th>
                    <th className="py-2 text-right font-medium" title="TVs em que esta campanha pode ir ao ar">
                      TVs
                    </th>
                    <th className="py-2 text-right font-medium">Exibições</th>
                    <th className="py-2 text-right font-medium">Scans</th>
                    <th className="py-2 text-right font-medium">Únicos</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.data.map((c) => (
                    <tr key={c.id} className="break-inside-avoid border-b last:border-0">
                      <td className="py-3 font-medium">{c.name}</td>
                      <td className="py-3 text-muted-foreground">
                        {day(c.startsAt)} – {day(c.endsAt)}
                      </td>
                      <td className="py-3">
                        <Badge variant={c.isActive ? 'default' : 'secondary'}>
                          {c.isActive ? 'Ativa' : 'Inativa'}
                        </Badge>
                      </td>
                      <td className="py-3 text-right tabular-nums">{int(c.deviceCount)}</td>
                      <td className="py-3 text-right tabular-nums">{int(c.totalPlays)}</td>
                      <td className="py-3 text-right tabular-nums">{int(c.totalScans)}</td>
                      <td className="py-3 text-right tabular-nums">{int(c.uniqueVisitors)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-muted-foreground">
        Scan mede resposta, não alcance. Um scan não é atribuível a uma exibição específica, e
        múltiplos scans da mesma pessoa contam no número bruto — use a taxa para comparar peças e
        campanhas entre si.
      </p>
    </div>
  );
}
