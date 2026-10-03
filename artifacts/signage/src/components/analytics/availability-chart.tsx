import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts';
import type { AnalyticsDay } from '@workspace/api-client-react';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';

export interface AvailabilityRow {
  date: string;
  ativas: number;
  paradas: number;
  semDados: number;
  activeDevices: number | null;
  totalDevices: number;
  plays: number;
  /** Último ponto da série: hoje, ainda em andamento. */
  partial: boolean;
}

const CONFIG = {
  ativas: { label: 'TVs que funcionaram', color: 'hsl(var(--chart-1))' },
  paradas: { label: 'TVs paradas', color: 'hsl(var(--destructive) / 0.45)' },
  // Neutro com contraste: --muted some no tema escuro e parecia "zero TVs".
  semDados: { label: 'Sem dados', color: 'hsl(var(--muted-foreground) / 0.35)' },
} satisfies ChartConfig;

const shortDate = (date: string) => {
  const [, month, day] = date.split('-');
  return `${day}/${month}`;
};

/**
 * O último ponto é sempre hoje (o período termina agora). As TVs ficam
 * desligadas fora do horário da loja, então a barra de hoje parece uma queda
 * até a loja abrir: marcamos `partial` para desenhá-la esmaecida.
 *
 * Dia sem histórico vira barra cinza de altura total: "não sei" tem de ser
 * visível e diferente de "nenhuma TV funcionou", que seria uma barra vazia.
 */
export function availabilityRows(series: AnalyticsDay[]): AvailabilityRow[] {
  return series.map((day, index) => ({
    date: day.date,
    ativas: day.activeDevices ?? 0,
    paradas: day.activeDevices === null ? 0 : day.totalDevices - day.activeDevices,
    semDados: day.activeDevices === null ? day.totalDevices : 0,
    activeDevices: day.activeDevices,
    totalDevices: day.totalDevices,
    plays: day.plays,
    partial: index === series.length - 1,
  }));
}

function DayTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: AvailabilityRow }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const tvs =
    row.activeDevices === null ? 'sem dados' : `${row.activeDevices} de ${row.totalDevices} TVs`;
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-sm">
      <p className="font-medium">{row.partial ? 'hoje (até agora)' : shortDate(row.date)}</p>
      {/* As exibições do dia ao lado das TVs: queda de exibição aparece junto
          da causa (TVs paradas) ou da falta dela (TVs no ar, sem campanha). */}
      <p>
        {tvs} · {row.plays.toLocaleString('pt-BR')} exibições
      </p>
    </div>
  );
}

export function AvailabilityChart({ series }: { series: AnalyticsDay[] }) {
  const rows = availabilityRows(series);
  const firstWithHistory = series.find((day) => day.activeDevices !== null);
  const hasGap = series.some((day) => day.activeDevices === null);

  return (
    <div>
      <ChartContainer config={CONFIG} className="h-[240px] w-full print:h-[200px] print:w-[680px]">
        <BarChart data={rows} margin={{ left: 4, right: 4, top: 8, bottom: 4 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={shortDate} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
          <ChartTooltip content={<DayTooltip />} />
          <Bar dataKey="ativas" stackId="tvs" fill="var(--color-ativas)" isAnimationActive={false}>
            {rows.map((row) => (
              <Cell key={row.date} fillOpacity={row.partial ? 0.4 : 1} />
            ))}
          </Bar>
          <Bar dataKey="paradas" stackId="tvs" fill="var(--color-paradas)" isAnimationActive={false}>
            {rows.map((row) => (
              <Cell key={row.date} fillOpacity={row.partial ? 0.4 : 1} />
            ))}
          </Bar>
          <Bar dataKey="semDados" stackId="tvs" fill="var(--color-semDados)" isAnimationActive={false}>
            {rows.map((row) => (
              <Cell key={row.date} fillOpacity={row.partial ? 0.4 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
      {!firstWithHistory ? (
        <p className="mt-2 text-xs text-muted-foreground">Ainda sem histórico de conexão das TVs neste período.</p>
      ) : hasGap ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Dias em cinza: sem dados — o histórico de conexão começa em {shortDate(firstWithHistory.date)}.
        </p>
      ) : null}
      {rows.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">A barra de hoje está em andamento.</p>
      )}
    </div>
  );
}
