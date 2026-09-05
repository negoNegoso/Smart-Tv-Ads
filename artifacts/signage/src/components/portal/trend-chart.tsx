// artifacts/signage/src/components/portal/trend-chart.tsx
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

function shortDate(date: string): string {
  const [, month, day] = date.split('-');
  return `${day}/${month}`;
}

/**
 * Gráfico de linhas do período.
 *
 * `rightKey` existe porque exibições vivem na casa dos milhares e scans na das
 * centenas: num eixo só, a linha de scans fica colada no zero e não informa
 * nada. Quando há só uma métrica, o eixo direito não é desenhado.
 *
 * `isAnimationActive={false}` não é preferência estética — a animação não
 * termina antes do navegador tirar o retrato da página na impressão, e o
 * gráfico sai pela metade no PDF.
 */
export function TrendChart({
  data,
  config,
  leftKey,
  rightKey,
}: {
  data: Array<Record<string, string | number>>;
  config: ChartConfig;
  leftKey: string;
  rightKey?: string;
}) {
  return (
    <ChartContainer config={config} className="h-[280px] w-full print:h-[220px] print:w-[680px]">
      <LineChart data={data} margin={{ left: 4, right: 4, top: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickFormatter={shortDate}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis yAxisId="left" tickLine={false} axisLine={false} width={48} allowDecimals={false} />
        {rightKey ? (
          <YAxis
            yAxisId="right"
            orientation="right"
            tickLine={false}
            axisLine={false}
            width={40}
            allowDecimals={false}
          />
        ) : null}
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => shortDate(String(v))} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Line
          yAxisId="left"
          dataKey={leftKey}
          type="monotone"
          stroke={`var(--color-${leftKey})`}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        {rightKey ? (
          <Line
            yAxisId="right"
            dataKey={rightKey}
            type="monotone"
            stroke={`var(--color-${rightKey})`}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        ) : null}
      </LineChart>
    </ChartContainer>
  );
}
