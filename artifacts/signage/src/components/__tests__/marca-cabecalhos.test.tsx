import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { SiteHeader } from '../landing/site-header';
import { SiteFooter } from '../landing/site-footer';
import { Layout } from '../layout';
import { PortalShell } from '../portal-shell';
import { PrintHeader } from '../portal/print-header';
import Login from '@/pages/login';
import NotFound from '@/pages/not-found';

function comQuery(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const CASOS: Array<[string, () => ReturnType<typeof render>]> = [
  ['cabeçalho da landing', () => render(<SiteHeader />)],
  ['rodapé da landing', () => render(<SiteFooter />)],
  ['painel admin', () => comQuery(<Layout>x</Layout>)],
  ['portal anunciante/cliente', () => comQuery(<PortalShell>x</PortalShell>)],
  ['cabeçalho impresso', () => render(<PrintHeader subject="Loja" period={{ from: '2026-09-01', to: '2026-09-25' }} />)],
  ['login', () => comQuery(<Login />)],
  ['404', () => render(<NotFound />)],
];

describe('logo da marca', () => {
  it.each(CASOS)('%s mostra o logo novo e não o ícone antigo', (_nome, montar) => {
    const { container } = montar();
    expect(screen.getByRole('img', { name: 'Smart Vale TV' })).toBeInTheDocument();
    expect(container.querySelector('.lucide-monitor-play')).toBeNull();
  });
});
