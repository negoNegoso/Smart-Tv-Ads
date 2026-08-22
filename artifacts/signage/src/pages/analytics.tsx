import { Users, Monitor, Play, Clock } from 'lucide-react';
import { useGetAnalyticsSummary } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ElementType }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground font-medium">{label}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
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

export default function Analytics() {
  const { data, isLoading } = useGetAnalyticsSummary();

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground mt-1">Platform-wide impression and uptime statistics.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Clients" value={data?.totalClients ?? 0} icon={Users} />
          <StatCard label="Total Devices" value={data?.totalDevices ?? 0} icon={Monitor} />
          <StatCard label="Total Impressions" value={data?.totalImpressions ?? 0} icon={Play} />
          <StatCard label="Total Display Time" value={formatDuration(data?.totalDuration ?? 0)} icon={Clock} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Top Announcements</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !data?.topAnnouncements?.length ? (
            <p className="text-muted-foreground text-sm py-4 text-center">No impressions recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 font-medium">Announcement</th>
                  <th className="text-right py-2 font-medium">Impressions</th>
                  <th className="text-right py-2 font-medium">Display Time</th>
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
                    <td className="py-3 text-right tabular-nums">{item.impressions}</td>
                    <td className="py-3 text-right tabular-nums text-muted-foreground">{formatDuration(item.totalDuration)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
