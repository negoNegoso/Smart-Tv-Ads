import { Users, Monitor, Play, Clock, QrCode } from 'lucide-react';
import { useGetAnalyticsSummary } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function StatCard({ label, value, icon: Icon, hint }: { label: string; value: string | number; icon: React.ElementType; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground font-medium">{label}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
            {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
          </div>
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

function formatRate(rate: number) {
  return `${(rate * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export default function Analytics() {
  const { data, isLoading } = useGetAnalyticsSummary();

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Análises</h1>
        <p className="text-muted-foreground mt-1">Estatísticas de exibições e disponibilidade de toda a rede.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <StatCard label="Total de clientes" value={data?.totalClients ?? 0} icon={Users} />
          <StatCard label="Total de TVs" value={data?.totalDevices ?? 0} icon={Monitor} />
          <StatCard label="Total de exibições" value={data?.totalPlays ?? 0} icon={Play} />
          <StatCard label="Tempo total de exibição" value={formatDuration(data?.totalDuration ?? 0)} icon={Clock} />
          <StatCard
            label="Total de scans"
            value={data?.totalScans ?? 0}
            icon={QrCode}
            hint={`${data?.totalUniqueScans ?? 0} visitantes únicos`}
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Anúncios em destaque</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !data?.topAnnouncements?.length ? (
            <p className="text-muted-foreground text-sm py-4 text-center">Nenhuma exibição registrada ainda.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 font-medium">Anúncio</th>
                  <th className="text-right py-2 font-medium">Exibições</th>
                  <th className="text-right py-2 font-medium">Scans</th>
                  <th className="text-right py-2 font-medium">Taxa</th>
                  <th className="text-right py-2 font-medium">Tempo de exibição</th>
                </tr>
              </thead>
              <tbody>
                {data.topAnnouncements.map((item, i) => (
                  <tr key={item.announcementId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-5 text-right">{i + 1}.</span>
                        <span className="font-medium">{item.title}</span>
                      </div>
                    </td>
                    <td className="py-3 text-right tabular-nums">{item.plays}</td>
                    <td className="py-3 text-right tabular-nums">{item.scans ?? 0}</td>
                    <td className="py-3 text-right tabular-nums text-muted-foreground">{formatRate(item.scanRate ?? 0)}</td>
                    <td className="py-3 text-right tabular-nums text-muted-foreground">{formatDuration(item.totalDuration)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <p className="mt-4 text-xs text-muted-foreground">
        Scan mede resposta, não alcance. Um scan não é atribuível a uma exibição específica, e múltiplos scans da mesma
        pessoa contam no número bruto — use a taxa para comparar peças e campanhas entre si.
      </p>
    </div>
  );
}
