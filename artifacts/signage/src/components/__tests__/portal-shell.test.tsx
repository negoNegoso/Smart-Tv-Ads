import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { PortalShell } from '../portal-shell';

describe('PortalShell', () => {
  it('mantém as regras de impressão no contêiner e leva o menu do portal', () => {
    const { hook } = memoryLocation({ path: '/portal/tvs' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Router hook={hook}>
          <PortalShell roles={['client']}>conteúdo</PortalShell>
        </Router>
      </QueryClientProvider>,
    );
    const conteiner = screen.getByText('conteúdo');
    expect(conteiner).toHaveClass('print:max-w-none', 'print:px-0', 'print:py-0');
    expect(screen.getByRole('link', { name: /Minhas TVs/ })).toBeInTheDocument();
  });
});
