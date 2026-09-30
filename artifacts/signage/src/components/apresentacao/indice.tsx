import { X } from 'lucide-react';
import { APRESENTACAO, type Bloco } from '@/lib/apresentacao-content';
import { cn } from '@/lib/utils';

export interface EntradaIndice {
  bloco: Bloco;
  label: string;
  primeiro: number;
}

/**
 * Atalho para pular o bloco que não serve a quem está na mesa. `data-no-nav`
 * faz o clique no fundo do painel não virar troca de slide.
 */
export function Indice({
  entradas,
  atual,
  onEscolher,
  onFechar,
}: {
  entradas: EntradaIndice[];
  atual: number;
  onEscolher: (slide: number) => void;
  onFechar: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label={APRESENTACAO.navegacao.indice}
      data-no-nav
      className="absolute bottom-16 right-4 z-20 w-72 rounded-xl border border-border bg-card p-4 shadow-lg"
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          {APRESENTACAO.navegacao.indice}
        </p>
        <button
          type="button"
          onClick={onFechar}
          aria-label={APRESENTACAO.navegacao.fecharIndice}
          className="rounded-md p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <ul className="space-y-1">
        {entradas.map((e, i) => {
          const fim = entradas[i + 1]?.primeiro ?? Infinity;
          const dentro = atual >= e.primeiro && atual < fim;
          return (
            <li key={e.bloco}>
              <button
                type="button"
                onClick={() => onEscolher(e.primeiro)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-base',
                  dentro ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted',
                )}
              >
                <span>{e.label}</span>
                <span className="text-sm opacity-70">
                  {APRESENTACAO.navegacao.slide} {e.primeiro + 1}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
