import { LANDING } from '@/lib/landing-content';
import { SlideShell } from '../slide-shell';

export function SlideComoFunciona() {
  const { title, tracks } = LANDING.howItWorks;
  return (
    <SlideShell titulo={title}>
      <div className="grid gap-8 md:grid-cols-2">
        {tracks.map((trilha) => (
          <div key={trilha.id} className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-xl font-semibold text-primary sm:text-2xl">{trilha.title}</h3>
            <ol className="mt-6 space-y-5">
              {trilha.steps.map((passo, i) => (
                <li key={passo.title} className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-lg font-semibold text-foreground">{passo.title}</p>
                    <p className="mt-1 text-base text-muted-foreground">{passo.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </SlideShell>
  );
}
