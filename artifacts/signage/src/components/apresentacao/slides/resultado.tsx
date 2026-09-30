import { APRESENTACAO } from '@/lib/apresentacao-content';
import { RelatorioMock } from '../relatorio-mock';
import { SlideShell } from '../slide-shell';

export function SlideResultado() {
  const { eyebrow, titulo, corpo } = APRESENTACAO.resultado;
  return (
    <SlideShell eyebrow={eyebrow} titulo={titulo}>
      <div className="grid gap-10 md:grid-cols-[2fr_3fr] md:items-center">
        <p className="text-lg leading-relaxed text-muted-foreground sm:text-2xl">{corpo}</p>
        <RelatorioMock />
      </div>
    </SlideShell>
  );
}
