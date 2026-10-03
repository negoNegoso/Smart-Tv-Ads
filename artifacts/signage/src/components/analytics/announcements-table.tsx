import type { AnalyticsAnnouncementRank } from '@workspace/api-client-react';

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

const formatRate = (rate: number) =>
  `${(rate * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/**
 * Peças em tabela, e não barra: comparar taxa de scan entre peças é leitura
 * de número.
 */
export function AnnouncementsTable({ items }: { items: AnalyticsAnnouncementRank[] }) {
  return (
    <div>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma exibição no período</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 text-left font-medium">Peça</th>
                <th className="py-2 text-right font-medium">Exibições</th>
                <th className="py-2 text-right font-medium">Scans</th>
                <th className="py-2 text-right font-medium">Taxa</th>
                <th className="py-2 text-right font-medium">Tempo</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.announcementId} className="border-b last:border-0">
                  <td className="py-2 font-medium">{item.title}</td>
                  <td className="py-2 text-right tabular-nums">{item.plays.toLocaleString('pt-BR')}</td>
                  <td className="py-2 text-right tabular-nums">{item.scans.toLocaleString('pt-BR')}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">{formatRate(item.scanRate)}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">{formatDuration(item.durationSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Scan mede resposta, não alcance. Um scan não é atribuível a uma exibição específica, e múltiplos scans da mesma
        pessoa contam no número bruto — use a taxa para comparar peças e campanhas entre si.
      </p>
    </div>
  );
}
