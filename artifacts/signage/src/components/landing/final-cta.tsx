import { LANDING, whatsappUrl } from '@/lib/landing-content';

/**
 * Repete as duas portas do hero para quem rolou a página inteira. As mensagens
 * são as mesmas do hero, de propósito: a origem do contato continua
 * identificada de qual lado a pessoa clicou.
 */
export function FinalCta() {
  return (
    <section className="bg-primary">
      <div className="mx-auto max-w-3xl px-5 py-14 text-center md:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          {LANDING.finalCta.title}
        </h2>
        <p className="mt-3 text-base text-white/80">{LANDING.finalCta.subtitle}</p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          {LANDING.hero.doors.map((door) => (
            <a
              key={door.id}
              href={whatsappUrl(door.message)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md bg-white px-5 py-3 text-sm font-semibold text-primary transition-opacity hover:opacity-90"
            >
              {door.title}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
