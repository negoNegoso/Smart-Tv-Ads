import { LANDING } from '@/lib/landing-content';

/**
 * Os quatro itens descrevem comportamento que o sistema realmente tem: QR por
 * campanha com bot descartado, bloqueio de concorrente do mesmo ramo, alvo por
 * segmento ou por telas escolhidas, e relatório por peça. Nada aqui é promessa
 * de roadmap — se um comportamento mudar no produto, este texto muda junto.
 */
export function Differentials() {
  return (
    <section id="diferenciais" className="scroll-mt-20 border-b border-border bg-card">
      <div className="mx-auto max-w-6xl px-5 py-14 md:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {LANDING.differentials.title}
        </h2>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {LANDING.differentials.items.map((item) => (
            <div key={item.title} className="rounded-lg border border-border bg-card p-6">
              <h3 className="font-semibold text-foreground">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
