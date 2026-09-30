import { APRESENTACAO } from '@/lib/apresentacao-content';
import { SlideShell } from '../slide-shell';

export function SlideProblema() {
  const { eyebrow, titulo, itens } = APRESENTACAO.problema;
  return (
    <SlideShell eyebrow={eyebrow} titulo={titulo}>
      <ul className="grid gap-6 md:grid-cols-3">
        {itens.map((item) => (
          <li key={item.titulo} className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-xl font-semibold text-foreground sm:text-2xl">{item.titulo}</h3>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">{item.corpo}</p>
          </li>
        ))}
      </ul>
    </SlideShell>
  );
}
