import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { AppShell } from '../app-shell';
import { adminNav } from '../nav-config';

const DESKTOP_WIDTH = 1024;

function renderShell(path: string) {
  const { hook } = memoryLocation({ path });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Router hook={hook}>
        <AppShell navGroups={adminNav}>
          <p>conteúdo da página</p>
        </AppShell>
      </Router>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  window.innerWidth = DESKTOP_WIDTH;
  document.cookie = 'sidebar_state=; max-age=0; path=/';
});

describe('AppShell no desktop', () => {
  it('mostra os grupos, os itens e o conteúdo', () => {
    renderShell('/companies');
    expect(screen.getByText('Operação')).toBeInTheDocument();
    expect(screen.getByText('Sistema')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Parque de TVs/ })).toHaveAttribute('href', '/parque');
    expect(screen.getByText('conteúdo da página')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sair/ })).toBeInTheDocument();
  });

  it('marca o item da rota filha e não marca a Visão geral', () => {
    renderShell('/companies/5');
    expect(screen.getByRole('link', { name: /Empresas/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Visão geral/ })).not.toHaveAttribute('aria-current');
  });

  it('na raiz marca a Visão geral', () => {
    renderShell('/');
    expect(screen.getByRole('link', { name: /Visão geral/ })).toHaveAttribute('aria-current', 'page');
  });

  it('menu e barra do topo somem na impressão', () => {
    const { container } = renderShell('/');
    const sidebar = container.querySelector('[data-slot="sidebar"]');
    expect(sidebar?.closest('.print\\:hidden')).not.toBeNull();
    const topo = screen.getByRole('button', { name: 'Menu' }).closest('header');
    expect(topo).toHaveClass('print:hidden');
  });
});

describe('AppShell e o estado recolhido', () => {
  it('sem cookie a sidebar abre expandida', () => {
    const { container } = renderShell('/');
    expect(container.querySelector('[data-slot="sidebar"]')).toHaveAttribute('data-state', 'expanded');
  });

  it('com sidebar_state=false a sidebar nasce recolhida', () => {
    document.cookie = 'sidebar_state=false; path=/';
    const { container } = renderShell('/');
    expect(container.querySelector('[data-slot="sidebar"]')).toHaveAttribute('data-state', 'collapsed');
  });

  it('recolhida no desktop, o logo aparece na barra do topo; aberta, só o texto', () => {
    // A sidebar recolhida continua no DOM (some por CSS), então o logo dela
    // também; o que muda é o que a barra do topo mostra.
    document.cookie = 'sidebar_state=false; path=/';
    const recolhida = renderShell('/');
    const topo = screen.getByRole('button', { name: 'Menu' }).closest('header') as HTMLElement;
    expect(within(topo).getAllByRole('img', { name: 'Smart Vale TV' })).toHaveLength(1);
    recolhida.unmount();

    document.cookie = 'sidebar_state=; max-age=0; path=/';
    renderShell('/');
    const topoAberto = screen.getByRole('button', { name: 'Menu' }).closest('header') as HTMLElement;
    expect(within(topoAberto).queryByRole('img', { name: 'Smart Vale TV' })).not.toBeInTheDocument();
    expect(within(topoAberto).getByText('Painel de Anúncios')).toBeInTheDocument();
  });
});

describe('AppShell no celular', () => {
  it('abre a gaveta pelo botão e fecha ao tocar num item', async () => {
    window.innerWidth = 500;
    const user = userEvent.setup();
    renderShell('/companies');
    // Gaveta fechada: os itens não estão na tela.
    await waitFor(() => expect(screen.queryByRole('link', { name: /Parque de TVs/ })).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    const item = await screen.findByRole('link', { name: /Parque de TVs/ });

    await user.click(item);
    await waitFor(() => expect(screen.queryByRole('link', { name: /Parque de TVs/ })).not.toBeInTheDocument());
  });
});
