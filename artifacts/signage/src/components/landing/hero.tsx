import { LANDING, whatsappUrl } from '@/lib/landing-content';
import { TvMockup } from './tv-mockup';

export function Hero() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-2 md:items-center md:py-20">
        <div>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
            {LANDING.hero.title}
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
            {LANDING.hero.subtitle}
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {LANDING.hero.doors.map((door) => (
              <div
                key={door.id}
                className="flex flex-col rounded-lg border border-border bg-card p-5 shadow-sm"
              >
                <span className="text-xs font-medium uppercase tracking-wide text-primary">
                  {door.eyebrow}
                </span>
                <h2 className="mt-2 text-lg font-semibold text-foreground">{door.title}</h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {door.description}
                </p>
                <a
                  href={whatsappUrl(door.message)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  {door.cta}
                </a>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-center md:justify-end">
          <TvMockup />
        </div>
      </div>
    </section>
  );
}
