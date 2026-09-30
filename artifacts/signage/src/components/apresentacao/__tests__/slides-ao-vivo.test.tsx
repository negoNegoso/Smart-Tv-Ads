import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APRESENTACAO } from '@/lib/apresentacao-content';
import { LANDING } from '@/lib/landing-content';
import { SlideRede } from '../slides/rede';
import { SlideSolucao } from '../slides/solucao';

const BASE = { plays30d: 10, clients: 5, segments: 3 };

function stubFetch(body: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) })),
  );
}

function renderCom(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return { client, ...utils };
}

async function esperarStats(client: QueryClient) {
  await waitFor(() => {
    expect(client.getQueryState(['public-stats'])?.status).not.toBe('pending');
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('SlideSolucao', () => {
  it('mostra o título e a TV (cai no exemplo sem API)', async () => {
    stubFetch({}, false);
    renderCom(<SlideSolucao />);
    expect(screen.getByRole('heading', { level: 2, name: APRESENTACAO.solucao.titulo })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: LANDING.mockup.portrait })).toBeInTheDocument();
  });
});

describe('SlideRede', () => {
  it('mostra telas ativas, cidades com parceiros e o mapa', async () => {
    stubFetch({
      ...BASE,
      activeScreens: 12,
      cities: [
        { ibge: '3542602', companies: 9 },
        { ibge: '3529906', companies: 2 },
      ],
    });
    const { container } = renderCom(<SlideRede />);
    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByText(LANDING.cobertura.screensLabel)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(APRESENTACAO.rede.cidadesComParceiros)).toBeInTheDocument();
    expect(container.querySelectorAll('path[data-ibge]')).toHaveLength(24);
  });

  it('com zero telas ativas não mostra o número', async () => {
    stubFetch({ ...BASE, activeScreens: 0, cities: [{ ibge: '3542602', companies: 9 }] });
    const { client } = renderCom(<SlideRede />);
    await esperarStats(client);
    expect(screen.queryByText(LANDING.cobertura.screensLabel)).not.toBeInTheDocument();
    expect(screen.getByText(LANDING.cobertura.regionLabel)).toBeInTheDocument();
  });

  it('com a API fora mostra só a frase das 24 cidades', async () => {
    stubFetch({}, false);
    const { client, container } = renderCom(<SlideRede />);
    await esperarStats(client);
    expect(screen.getByText(LANDING.cobertura.regionLabel)).toBeInTheDocument();
    expect(screen.queryByText(LANDING.cobertura.screensLabel)).not.toBeInTheDocument();
    expect(screen.queryByText(APRESENTACAO.rede.cidadesComParceiros)).not.toBeInTheDocument();
    expect(container.querySelector('path[data-ibge]')).toBeNull();
  });

  it('enquanto carrega já mostra as 24 cidades e nenhum número', () => {
    // fetch que nunca resolve: 4G lento no meio da reunião.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    renderCom(<SlideRede />);
    expect(screen.getByText(LANDING.cobertura.regionLabel)).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});
