import { TvMockup } from '@/components/landing/tv-mockup';
import { APRESENTACAO } from '@/lib/apresentacao-content';
import { SlideShell } from '../slide-shell';

/**
 * A TV da landing, com as peças que estão no ar de verdade. Os botões de
 * orientação são `button`, então tocar neles não troca de slide.
 */
export function SlideSolucao() {
  const { eyebrow, titulo, corpo } = APRESENTACAO.solucao;
  return (
    <SlideShell eyebrow={eyebrow} titulo={titulo}>
      <div className="grid gap-10 md:grid-cols-[2fr_3fr] md:items-center">
        <p className="text-lg leading-relaxed text-muted-foreground sm:text-2xl">{corpo}</p>
        <TvMockup />
      </div>
    </SlideShell>
  );
}
