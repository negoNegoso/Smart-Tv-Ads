import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import type { AnalyticsHour } from '@workspace/api-client-react';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';

const CONFIG = { plays: { label: 'Exibições', color: 'hsl(var(--chart-1))' } } satisfies ChartConfig;

/** Hora com mais exibições; no empate, a mais cedo. `null` sem exibição. */
export function peakHour(hours: AnalyticsHour[]): AnalyticsHour | null {
  let peak: AnalyticsHour | null = null;
  for (const point of hours) {
    if (point.plays > 0 && (!peak || point.plays > peak.plays || (point.plays === peak.plays && point.hour < peak.hour))) {
      peak = point;
    }
  }
  return peak;
}

export function HourlyChart({ hours }: { hours: AnalyticsHour[] }) {
  const peak = peakHour(hours);
  return (
    <div>
      <ChartContainer config={CONFIG} className="h-[240px] w-full print:h-[200px] print:w-[680px]">
        <BarChart data={hours} margin={{ left: 4, right: 4, top: 8, bottom: 4 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="hour" tickFormatter={(h) => `${h}h`} tickLine={false} axisLine={false} interval={2} />
          <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, payload) => `${payload?.[0]?.payload?.hour ?? ''}h`} />} />
          <Bar dataKey="plays" fill="var(--color-plays)" isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
      <p className="mt-2 text-xs text-muted-foreground">
        {peak
          ? `Pico: ${peak.hour}h (${peak.plays.toLocaleString('pt-BR')} exibições)`
          : 'Nenhuma exibição no período'}
      </p>
    </div>
  );
}
