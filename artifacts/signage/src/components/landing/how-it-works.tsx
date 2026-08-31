import { LANDING } from '@/lib/landing-content';

export function HowItWorks() {
  return (
    <section id="como-funciona" className="scroll-mt-20 border-b border-zinc-200">
      <div className="mx-auto max-w-6xl px-5 py-14 md:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
          {LANDING.howItWorks.title}
        </h2>

        <div className="mt-10 grid gap-10 md:grid-cols-2">
          {LANDING.howItWorks.tracks.map((track) => (
            <div key={track.id}>
              <h3 className="text-lg font-semibold text-primary">{track.title}</h3>
              <ol className="mt-5 space-y-5">
                {track.steps.map((step, index) => (
                  <li key={step.title} className="flex gap-4">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-medium text-zinc-900">{step.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-zinc-600">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
