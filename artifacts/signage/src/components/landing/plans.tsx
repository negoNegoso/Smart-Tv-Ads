import { Check } from 'lucide-react';
import { LANDING, whatsappUrl } from '@/lib/landing-content';

/**
 * Dois blocos lado a lado, um por porta: quem paga para anunciar e quem cede a
 * tela. O card do anunciante é o destacado — é o único lado que gera receita.
 *
 * O que está listado aqui é só o que o sistema entrega hoje: alvo em toda a
 * rede, várias artes por campanha, QR por peça e relatório por peça. Frequência
 * e tempo de tela ficam de fora de propósito, porque não existe cota no loop
 * para garantir isso. Se um dia existir, entra aqui — e não antes.
 */

type Term = { label: string; value: string; hint?: string };

type Plan = {
  eyebrow: string;
  title: string;
  price: string;
  period: string;
  note: string;
  features: readonly string[];
  termsLabel: string;
  terms: readonly Term[];
  cta: string;
  message: string;
};

function PlanCard({ plan, featured }: { plan: Plan; featured: boolean }) {
  return (
    <div
      className={
        featured
          ? 'flex flex-col rounded-lg border-2 border-primary bg-card p-6 shadow-sm md:p-8'
          : 'flex flex-col rounded-lg border border-border bg-card p-6 md:p-8'
      }
    >
      <span className="text-xs font-medium uppercase tracking-wide text-primary">
        {plan.eyebrow}
      </span>
      <h3 className="mt-2 text-lg font-semibold text-foreground">{plan.title}</h3>

      <p className="mt-4 flex items-baseline gap-1">
        <span className="text-4xl font-semibold tracking-tight text-foreground">{plan.price}</span>
        {plan.period ? <span className="text-sm text-muted-foreground">{plan.period}</span> : null}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{plan.note}</p>

      <ul className="mt-6 flex-1 space-y-3">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {plan.terms.length > 0 ? (
        <div className="mt-6 rounded-md border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {plan.termsLabel}
          </p>
          <dl className="mt-3 space-y-2">
            {plan.terms.map((term) => (
              <div key={term.label} className="flex items-baseline justify-between gap-3">
                <dt className="text-sm text-muted-foreground">{term.label}</dt>
                <dd className="text-right">
                  <span className="text-sm font-semibold text-foreground">{term.value}</span>
                  {term.hint ? (
                    <span className="block text-xs text-muted-foreground">{term.hint}</span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      <a
        href={whatsappUrl(plan.message)}
        target="_blank"
        rel="noopener noreferrer"
        className={
          featured
            ? 'mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90'
            : 'mt-6 inline-flex items-center justify-center rounded-md border border-border px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-foreground'
        }
      >
        {plan.cta}
      </a>
    </div>
  );
}

export function Plans() {
  return (
    <section id="planos" className="scroll-mt-20 border-b border-border">
      <div className="mx-auto max-w-6xl px-5 py-14 md:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {LANDING.plans.title}
        </h2>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
          {LANDING.plans.subtitle}
        </p>

        <div className="mt-10 grid items-start gap-6 md:grid-cols-2">
          <PlanCard plan={LANDING.plans.advertiser} featured />
          <PlanCard plan={LANDING.plans.host} featured={false} />
        </div>
      </div>
    </section>
  );
}
