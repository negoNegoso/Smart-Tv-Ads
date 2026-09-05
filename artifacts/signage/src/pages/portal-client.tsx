import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Monitor, Play, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import type { ChartConfig } from '@/components/ui/chart';
import { KpiCard } from '@/components/portal/kpi-card';
import { PeriodFilter, type PortalDays } from '@/components/portal/period-filter';
import { PrintHeader } from '@/components/portal/print-header';
import { TrendChart } from '@/components/portal/trend-chart';
import { formatDelta } from '@/components/portal/delta';
import { cn } from '@/lib/utils';

interface PortalDevice {
  id: number;
  name: string;
  location: string | null;
  lastSeenAt: string | null;
  totalPlays: number;
}

interface ClientOverview {
  period: { days: PortalDays; from: string; to: string };
  totals: { plays: number; devices: number; devicesOnline: number; previous: { plays: number } };
  series: Array<{ date: string; plays: number }>;
}

/** Erro de rede não pode virar lista vazia — ver a nota em portal-advertiser.tsx. */
async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}${path}`);
  if (!res.ok) throw new Error(`Falha ao carregar ${path}: ${res.status}`);
  return res.json();
}

const CHART_CONFIG = {
  plays: { label: 'Exibições', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

/** Mesma janela que o backend usa em DEVICE_ONLINE_WINDOW_MINUTES. */
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

const int = (n: number) => n.toLocaleString('pt-BR');

function isOnline(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() <= ONLINE_WINDOW_MS;
}

export default function PortalClient() {
  const [days, setDays] = useState<PortalDays>(30);

  const overview = useQuery({
    queryKey: ['portal', 'client', 'overview', days],
    queryFn: () => getJson<ClientOverview>(`api/portal/client/overview?days=${days}`),
    retry: false,
  });

  const devices = useQuery({
    queryKey: ['portal', 'client', 'devices', days],
    queryFn: () => getJson<PortalDevice[]>(`api/portal/client/devices?days=${days}`),
    retry: false,
  });

  if (overview.isError || devices.isError) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Não foi possível carregar seus dados</EmptyTitle>
          <EmptyDescription>
            O servidor não respondeu. Suas TVs continuam exibindo — isto é uma falha de leitura.
          </EmptyDescription>
        </EmptyHeader>
        <Button
          onClick={() => {
            overview.refetch();
            devices.refetch();
          }}
        >
          Tentar de novo
        </Button>
      </Empty>
    );
  }

  const totals = overview.data?.totals;
  const period = overview.data?.period;

  return (
    <div>
      {period ? <PrintHeader subject="Minhas TVs" period={period} /> : null}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold print:hidden">Minhas TVs</h1>
        <div className="ml-auto flex items-center gap-2">
          <PeriodFilter value={days} onChange={setDays} />
          <Button variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
            Imprimir / PDF
          </Button>
        </div>
      </div>

      {overview.isLoading || !totals ? (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <KpiCard
            label="Exibições no período"
            value={int(totals.plays)}
            icon={Play}
            delta={formatDelta(totals.plays, totals.previous.plays)}
          />
          <KpiCard label="TVs cadastradas" value={int(totals.devices)} icon={Monitor} />
          <KpiCard
            label="TVs online agora"
            value={int(totals.devicesOnline)}
            icon={Wifi}
            hint="Reportaram nos últimos 5 minutos"
          />
        </div>
      )}

      <Card className="mb-6 break-inside-avoid">
        <CardHeader>
          <CardTitle>Exibições por dia</CardTitle>
        </CardHeader>
        <CardContent>
          {overview.isLoading || !overview.data ? (
            <Skeleton className="h-[280px] w-full rounded-lg" />
          ) : (
            <TrendChart data={overview.data.series} config={CHART_CONFIG} leftKey="plays" />
          )}
        </CardContent>
      </Card>

      <Card className="break-inside-avoid">
        <CardHeader>
          <CardTitle>TVs no período</CardTitle>
        </CardHeader>
        <CardContent>
          {devices.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !devices.data?.length ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Nenhuma TV encontrada</EmptyTitle>
                <EmptyDescription>
                  Quando uma TV sua for cadastrada, ela aparece aqui.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-muted-foreground">
                  <tr>
                    <th className="py-2 font-medium">TV</th>
                    <th className="py-2 font-medium">Local</th>
                    <th className="py-2 font-medium">Status</th>
                    <th className="py-2 text-right font-medium">Exibições</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.data.map((d) => (
                    <tr key={d.id} className="break-inside-avoid border-b last:border-0">
                      <td className="py-3 font-medium">{d.name}</td>
                      <td className="py-3 text-muted-foreground">{d.location ?? '—'}</td>
                      <td className="py-3">
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden
                            className={cn(
                              'h-2 w-2 rounded-full print:border print:border-current',
                              isOnline(d.lastSeenAt) ? 'bg-emerald-500' : 'bg-muted-foreground/40',
                            )}
                          />
                          {isOnline(d.lastSeenAt) ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td className="py-3 text-right tabular-nums">{int(d.totalPlays)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
