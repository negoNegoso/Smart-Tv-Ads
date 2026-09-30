import { Check } from 'lucide-react';
import { APRESENTACAO } from '@/lib/apresentacao-content';
import { LANDING } from '@/lib/landing-content';
import { SlideShell } from '../slide-shell';

export function SlidePlanoPonto() {
  const plano = LANDING.plans.host;
  return (
    <SlideShell eyebrow={APRESENTACAO.planoPonto.eyebrow} titulo={plano.title}>
      <div className="grid gap-10 md:grid-cols-2 md:items-start">
        <div>
          <p className="text-6xl font-semibold tracking-tight text-primary sm:text-7xl">{plano.price}</p>
          <p className="mt-2 text-lg text-muted-foreground">{plano.note}</p>
        </div>
        <ul className="space-y-4">
          {plano.features.map((f) => (
            <li key={f} className="flex gap-3 text-lg text-foreground">
              <Check className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>
    </SlideShell>
  );
}
