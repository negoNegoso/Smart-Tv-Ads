import type { ReactNode } from 'react';

/**
 * Moldura de um slide. Tipografia maior que a da landing: a apresentação é
 * lida do outro lado da mesa ou numa TV na parede, não a um palmo do rosto.
 */
export function SlideShell({
  eyebrow,
  titulo,
  children,
}: {
  eyebrow?: string;
  titulo?: string;
  children?: ReactNode;
}) {
  return (
    <section
      aria-roledescription="slide"
      aria-label={titulo}
      className="flex min-h-full w-full flex-col justify-center px-6 py-12 sm:px-12 lg:px-20"
    >
      <div className="mx-auto w-full max-w-6xl">
        {eyebrow ? (
          <p className="text-sm font-semibold uppercase tracking-widest text-primary sm:text-base">{eyebrow}</p>
        ) : null}
        {titulo ? (
          <h2 className="mt-2 text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">
            {titulo}
          </h2>
        ) : null}
        <div className={titulo ? 'mt-8 sm:mt-12' : undefined}>{children}</div>
      </div>
    </section>
  );
}
