import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { Router } from 'wouter';
import { TooltipProvider } from '@/components/ui/tooltip';
import Landing from '@/pages/landing';

/**
 * Entrada do build SSR (vite build --ssr). Não roda em servidor nenhum: o
 * scripts/prerender.mjs chama render() uma vez no build e grava o home.html.
 *
 * Os reexports existem para o script usar exatamente o código testado em src/,
 * já com o alias @/ resolvido pelo Vite.
 */
export { buildStructuredData, serializeJsonLd } from '@/lib/structured-data';
export {
  buildRobots,
  buildSitemap,
  injectPrerender,
  sessionHintHead,
} from '@/lib/prerender-html';
export { SESSION_HINT_KEY } from '@/lib/session-hint';

/**
 * Mesmos providers que o App dá à landing. QueryClient novo e vazio: no
 * servidor o react-query não busca, então a cobertura (que depende da API)
 * sai vazia e o navegador a monta depois, como já faz hoje.
 */
export function render(): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <Router base={base} ssrPath={`${base}/`}>
          <Landing />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}
