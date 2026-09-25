import { SiteHeader } from '@/components/landing/site-header';
import { SiteFooter } from '@/components/landing/site-footer';
import { Hero } from '@/components/landing/hero';
import { Cobertura } from '@/components/landing/cobertura';
import { HowItWorks } from '@/components/landing/how-it-works';
import { Differentials } from '@/components/landing/differentials';
import { Plans } from '@/components/landing/plans';
import { Faq } from '@/components/landing/faq';
import { FinalCta } from '@/components/landing/final-cta';

/**
 * Porta de entrada pública. Este arquivo só compõe: todo texto vive em
 * lib/landing-content.ts e cada seção tem o seu componente.
 *
 * Mesmo tema escuro do resto do sistema; não depende de preferência de
 * sistema de quem chega.
 */
export default function Landing() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <SiteHeader />
      <main>
        <Hero />
        <Cobertura />
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
