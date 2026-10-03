import { Link } from 'wouter';

export interface RankingItem {
  key: number;
  label: string;
  sublabel: string;
  value: number;
  href: string;
}

/**
 * Barras horizontais em CSS, e não Recharts: cada linha precisa ser um link
 * de verdade, clicável no celular e lido pelo leitor de tela.
 */
export function RankingList({ items }: { items: RankingItem[] }) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma exibição no período</p>;
  }
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <ol className="space-y-3">
      {items.map((item) => (
        <li key={item.key}>
          <Link href={item.href} className="block rounded-md p-1 hover:bg-muted/40">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium">{item.label}</span>
              <span className="shrink-0 tabular-nums">{item.value.toLocaleString('pt-BR')}</span>
            </div>
            <p className="truncate text-xs text-muted-foreground">{item.sublabel}</p>
            <div className="mt-1 h-2 rounded-full bg-muted">
              <div
                data-testid={`ranking-bar-${item.key}`}
                className="h-2 rounded-full bg-primary"
                style={{ width: `${Math.round((item.value / max) * 100)}%` }}
              />
            </div>
          </Link>
        </li>
      ))}
    </ol>
  );
}
