import { useGetDeviceSessions, getGetDeviceSessionsQueryKey } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { buildConnectionTimeline, formatMoment, formatSpan } from '@/lib/connection-timeline';

/**
 * Linha do tempo de quedas da TV. Sem percentual de propósito: loja que
 * desliga a TV à noite aparece fora do ar, e quem olha julga se foi problema.
 */
export function DeviceConnectionHistory({ deviceId }: { deviceId: number }) {
  // Mesmo ritmo do player: a TV fala com o servidor a cada 60 s.
  const { data, isLoading, isError } = useGetDeviceSessions(deviceId, {
    query: { enabled: !!deviceId, queryKey: getGetDeviceSessionsQueryKey(deviceId), refetchInterval: 60_000 },
  });

  const now = new Date();
  // `?? []`: resposta fora do contrato não pode derrubar a página da TV.
  const timeline = buildConnectionTimeline(data?.sessions ?? [], data?.isOnline ?? false, now);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Histórico de conexão</CardTitle>
        <p className="text-sm text-muted-foreground">
          Últimos 30 dias. Quedas de menos de 5 minutos não aparecem.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : isError ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Não foi possível carregar o histórico.</p>
        ) : timeline.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nenhuma conexão registrada nos últimos 30 dias. O registro de conexões começou em outubro de 2026.
          </p>
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto text-sm">
            {timeline.map((entry) => (
              <li key={`${entry.kind}-${entry.from.getTime()}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="flex w-28 items-center gap-2 font-medium">
                  <span
                    aria-hidden
                    className={cn(
                      'h-2 w-2 rounded-full',
                      entry.kind === 'online' ? 'bg-emerald-500' : 'bg-muted-foreground/40',
                    )}
                  />
                  <span>{entry.kind === 'online' ? 'No ar' : 'Fora do ar'}</span>
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {formatMoment(entry.from, now)} → {entry.open ? 'agora' : formatMoment(entry.to, now)}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  ({formatSpan(entry.to.getTime() - entry.from.getTime())})
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
