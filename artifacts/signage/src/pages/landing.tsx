import { SiteHeader } from '@/components/landing/site-header';
import { SiteFooter } from '@/components/landing/site-footer';

/**
 * Porta de entrada pública. Este arquivo só compõe: todo texto vive em
 * lib/landing-content.ts e cada seção tem o seu componente.
 *
 * Tema claro fixo, sem depender da classe .dark — página pública de captação
 * não deveria mudar de cara conforme a preferência de sistema de quem chega.
 */
export default function Landing() {
  return (
    <div className="min-h-[100dvh] bg-white text-zinc-900">
      <SiteHeader />
      <main>{/* seções entram nas tarefas 5 a 8 */}</main>
      <SiteFooter />
    </div>
  );
}
