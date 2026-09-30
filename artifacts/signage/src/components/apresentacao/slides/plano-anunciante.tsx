import { Check } from 'lucide-react';
import { APRESENTACAO } from '@/lib/apresentacao-content';
import { LANDING } from '@/lib/landing-content';
import { SlideShell } from '../slide-shell';

export function SlidePlanoAnunciante() {
  const plano = LANDING.plans.advertiser;
  return (
    <SlideShell eyebrow={APRESENTACAO.planoAnunciante.eyebrow} titulo={plano.title}>
      <div className="grid gap-10 md:grid-cols-2 md:items-start">
        <div>
          <p className="flex items-baseline gap-2">
            <span className="text-6xl font-semibold tracking-tight text-primary sm:text-7xl">{plano.price}</span>
            <span className="text-2xl text-muted-foreground">{plano.period}</span>
          </p>
          <p className="mt-2 text-lg text-muted-foreground">{plano.note}</p>
          <p className="mt-8 text-base font-semibold text-foreground">{plano.termsLabel}</p>
          <dl className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
            {plano.terms.map((termo) => (
              <div key={termo.label} className="flex items-baseline justify-between gap-4 px-5 py-3">
                <dt className="text-base text-muted-foreground">{termo.label}</dt>
                <dd className="text-right">
                  <span className="text-lg font-semibold text-foreground">{termo.value}</span>
                  {'hint' in termo ? (
                    <span className="block text-sm text-muted-foreground">{termo.hint}</span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
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
