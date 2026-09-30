import { Logo } from '@/components/brand/logo';
import { APRESENTACAO } from '@/lib/apresentacao-content';
import { SlideShell } from '../slide-shell';

export function SlideCapa() {
  return (
    <SlideShell>
      <div className="flex flex-col items-center gap-8 text-center">
        <Logo className="h-16 text-foreground sm:h-28" />
        <p className="max-w-3xl text-2xl leading-snug text-muted-foreground sm:text-4xl">
          {APRESENTACAO.capa.tagline}
        </p>
      </div>
    </SlideShell>
  );
}
