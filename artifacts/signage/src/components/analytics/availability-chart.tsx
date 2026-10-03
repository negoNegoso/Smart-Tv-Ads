import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import type { AnalyticsDay } from '@workspace/api-client-react';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';

export interface AvailabilityRow {
  date: string;
  ativas: number;
  semDados: number;
  activeDevices: number | null;
  totalDevices: number;
  plays: number;
}

const CONFIG = {
  ativas: { label: 'TVs que funcionaram', color: 'hsl(var(--chart-1))' },
  semDados: { label: 'Sem dados', color: 'hsl(var(--muted))' },
} satisfies ChartConfig;

const shortDate = (date: string) => {
  const [, month, day] = date.split('-');
  return `${day}/${month}`;
};

/**
 * Dia sem histórico vira barra cinza de altura total: "não sei" tem de ser
 * visível e diferente de "nenhuma TV funcionou", que seria uma barra vazia.
 */
export function availabilityRows(series: AnalyticsDay[]): AvailabilityRow[] {
  return series.map((day) => ({
    date: day.date,
    ativas: day.activeDevices ?? 0,
    semDados: day.activeDevices === null ? day.totalDevices : 0,
    activeDevices: day.activeDevices,
    totalDevices: day.totalDevices,
    plays: day.plays,
  }));
}

function DayTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: AvailabilityRow }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const tvs =
    row.activeDevices === null ? 'sem dados' : `${row.activeDevices} de ${row.totalDevices} TVs`;
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-sm">
      <p className="font-medium">{shortDate(row.date)}</p>
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
          <Bar dataKey="ativas" stackId="tvs" fill="var(--color-ativas)" isAnimationActive={false} />
          <Bar dataKey="semDados" stackId="tvs" fill="var(--color-semDados)" isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
      {!firstWithHistory ? (
        <p className="mt-2 text-xs text-muted-foreground">Ainda sem histórico de conexão das TVs neste período.</p>
      ) : hasGap ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Dias em cinza: sem dados — o histórico de conexão começa em {shortDate(firstWithHistory.date)}.
        </p>
      ) : null}
    </div>
  );
}
