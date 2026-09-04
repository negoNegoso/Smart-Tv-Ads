import * as React from 'react';
import { SiteHeader } from '@/components/landing/site-header';
import { SiteFooter } from '@/components/landing/site-footer';
import { Hero } from '@/components/landing/hero';
import { StatsBand } from '@/components/landing/stats-band';
import { HowItWorks } from '@/components/landing/how-it-works';
import { Differentials } from '@/components/landing/differentials';
import { Plans } from '@/components/landing/plans';
import { Faq } from '@/components/landing/faq';
import { FinalCta } from '@/components/landing/final-cta';

/**
 * Porta de entrada pública. Este arquivo só compõe: todo texto vive em
 * lib/landing-content.ts e cada seção tem o seu componente.
 *
 * Tema claro fixo, sem depender da classe .dark — página pública de captação
 * não deveria mudar de cara conforme a preferência de sistema de quem chega.
 */
export default function Landing() {
  return (
    <div
      className="min-h-[100dvh] bg-white text-zinc-900"
      // Trava a paleta clara: a landing e publica e nao deve mudar de cara
      // conforme a preferencia de tema de quem chega. Os componentes seguem
      // usando text-primary/bg-primary; o valor e que fica fixo aqui.
      style={{ '--primary': '248 100% 50%', '--primary-foreground': '0 0% 100%' } as React.CSSProperties}
    >
      <SiteHeader />
      <main>
        <Hero />
        <StatsBand />
        <HowItWorks />
        <Differentials />
        <Plans />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
