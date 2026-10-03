import { cn } from '@/lib/utils';

export interface OnlineDay {
  date: string;
  online: boolean | null;
}

const shortDate = (date: string) => {
  const [, month, day] = date.split('-');
  return `${day}/${month}`;
};

const STATE = {
  true: { label: 'funcionou', className: 'bg-emerald-500' },
  false: { label: 'parada', className: 'bg-red-500' },
  null: { label: 'sem dados', className: 'bg-muted-foreground/35' },
} as const;

/**
 * Um quadrado por dia. CSS, e não gráfico: com uma TV só, barra de 0 ou 1 é
 * desperdício, e quadrado colorido imprime bem. Cada quadrado tem rótulo para
 * leitor de tela; o último é hoje, ainda em andamento — as TVs desligam fora
 * do horário da loja, e de manhã cedo hoje pareceria uma TV parada.
 */
export function OnlineDaysStrip({ days }: { days: OnlineDay[] }) {
  return (
    <div>
      <ul aria-label="Dias no ar" className="flex flex-wrap gap-1">
        {days.map((day, index) => {
          const state = STATE[String(day.online) as 'true' | 'false' | 'null'];
          const today = index === days.length - 1;
          return (
            <li
              key={day.date}
              aria-label={`${shortDate(day.date)}: ${state.label}${today ? ' (hoje, em andamento)' : ''}`}
              title={`${shortDate(day.date)}: ${state.label}`}
              className={cn('h-5 w-5 rounded-sm', state.className, today && 'opacity-50 outline-dashed outline-1 outline-foreground')}
            />
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-emerald-500" />Funcionou</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-red-500" />Parada</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-muted-foreground/35" />Sem dados</span>
      </div>
    </div>
  );
}
