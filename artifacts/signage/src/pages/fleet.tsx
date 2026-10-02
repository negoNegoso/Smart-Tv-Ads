import { useState } from 'react';
import { Link } from 'wouter';
import { CircleAlert, Monitor, Wifi, WifiOff } from 'lucide-react';
import { useGetFleet, getGetFleetQueryKey } from '@workspace/api-client-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { filterFleet, fleetCounts, lastSeenLabel, versionsInUse, type FleetFilter, type FleetRow } from '@/lib/fleet';

const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

function tvs(count: number) {
  return count === 1 ? '1 TV' : `${count} TVs`;
}

export default function Fleet() {
  const [filter, setFilter] = useState<FleetFilter>('all');

  // Mesmo ritmo do player: a TV fala com o servidor a cada 60 s.
  const { data, isLoading, isError } = useGetFleet({
    query: { queryKey: getGetFleetQueryKey(), refetchInterval: 60_000 },
  });

  const devices: FleetRow[] = data?.devices ?? [];
  const latestVersion = data?.latestVersion ?? null;
  const counts = fleetCounts(devices);
  const versions = versionsInUse(devices);
  const rows = filterFleet(devices, filter);
  const now = new Date();

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Parque de TVs</h1>
        <p className="mt-1 text-muted-foreground">Quem está no ar agora e que versão do app cada TV roda.</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Metric id="total" icon={Monitor} label="Total" value={counts.total} />
        <Metric id="online" icon={Wifi} label="Online" value={counts.online} />
        <Metric id="offline" icon={WifiOff} label="Offline" value={counts.offline} />
        <Metric id="outdated" icon={CircleAlert} label="Desatualizadas" value={counts.outdated} />
      </div>

      {isError ? (
        <Card className="py-16 text-center">
          <CardContent>
            <p className="font-medium text-muted-foreground">Não foi possível carregar o parque.</p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
      ) : (
        <>
          <Card className="mb-6" data-testid="fleet-versions">
            <CardHeader>
              <CardTitle className="text-base">Versões em uso</CardTitle>
              <p className="text-sm text-muted-foreground">
                {latestVersion
                  ? `Última versão publicada: ${latestVersion}.`
                  : 'Não foi possível consultar a última versão publicada; nenhuma TV é marcada como desatualizada.'}
              </p>
            </CardHeader>
            <CardContent>
              {versions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma versão registrada.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {versions.map(({ version, count }) => (
                    <li key={version ?? 'navegador'} className="flex items-center justify-between py-2">
                      <span className="font-medium tabular-nums">{version ?? 'navegador'}</span>
                      <span className="text-muted-foreground">{tvs(count)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="mb-4 max-w-xs space-y-2">
            <Label htmlFor="fleet-filter">Mostrar</Label>
            <select
              id="fleet-filter"
              className={selectClass}
              value={filter}
              onChange={(e) => setFilter(e.target.value as FleetFilter)}
            >
              <option value="all">Todas</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="outdated">Desatualizadas</option>
            </select>
          </div>

          {devices.length === 0 ? (
            <Card className="py-12 text-center">
              <CardContent>
                <p className="font-medium text-muted-foreground">Nenhuma TV cadastrada.</p>
              </CardContent>
            </Card>
          ) : rows.length === 0 ? (
            <Card className="py-12 text-center">
              <CardContent>
                <p className="font-medium text-muted-foreground">Nenhuma TV neste filtro.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="overflow-x-auto pt-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium">TV</th>
                      <th className="pb-2 font-medium">Empresa</th>
                      <th className="pb-2 font-medium">Local</th>
                      <th className="pb-2 font-medium">Visto por último</th>
                      <th className="pb-2 font-medium">Versão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((d) => (
                      <tr key={d.id} data-testid={`fleet-row-${d.id}`} className="border-b last:border-0">
                        <td className="py-3">
                          <span className="flex items-center gap-2">
                            <span
                              aria-hidden
                              className={cn('h-2 w-2 rounded-full', d.isOnline ? 'bg-emerald-500' : 'bg-muted-foreground/40')}
                            />
                            {d.isOnline ? 'Online' : 'Offline'}
                          </span>
                        </td>
                        <td className="py-3 font-medium">
                          <span className="flex flex-wrap items-center gap-2">
                            <Link href={`/devices/${d.id}`} className="hover:underline">{d.name}</Link>
                            {d.showcase ? <Badge variant="secondary">Vitrine</Badge> : null}
                          </span>
                        </td>
                        <td className="py-3 text-muted-foreground">{d.clientName}</td>
                        <td className="py-3 text-muted-foreground">{d.location ?? '—'}</td>
                        <td className="py-3 tabular-nums text-muted-foreground">{lastSeenLabel(d.lastSeenAt, now)}</td>
                        <td className="py-3">
                          <span className="flex flex-wrap items-center gap-2 tabular-nums">
                            {d.appVersion ?? 'navegador'}
                            {d.outdated ? <Badge variant="outline">Desatualizada</Badge> : null}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Metric({ id, icon: Icon, label, value }: { id: string; icon: React.ElementType; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold" data-testid={`fleet-count-${id}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
