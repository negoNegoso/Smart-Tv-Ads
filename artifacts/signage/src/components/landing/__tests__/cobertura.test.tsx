import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Cobertura } from '../cobertura';

const BASE = { plays30d: 10, activeScreens: 12, clients: 5, segments: 3 };

function stubStats(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })),
  );
}

function renderSecao() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Cobertura />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('Cobertura', () => {
  it('começa na cidade com mais parceiros', async () => {
    stubStats({
      ...BASE,
      cities: [
        { ibge: '3529906', companies: 2 }, // Miracatu
        { ibge: '3542602', companies: 9 }, // Registro
      ],
    });
    renderSecao();
    expect(await screen.findByText('Registro')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  it('troca o número ao clicar em outra cidade parceira', async () => {
    stubStats({
      ...BASE,
      cities: [
        { ibge: '3542602', companies: 9 },
        { ibge: '3529906', companies: 2 },
      ],
    });
    renderSecao();
    await userEvent.click(await screen.findByRole('button', { name: /Miracatu/ }));
    expect(screen.getByText('Miracatu')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('não deixa clicar em cidade sem parceiro', async () => {
    stubStats({ ...BASE, cities: [{ ibge: '3542602', companies: 9 }] });
    renderSecao();
    await screen.findByText('Registro');
    expect(screen.queryByRole('button', { name: /Tapiraí/ })).not.toBeInTheDocument();
  });

  it('some da página quando a API falha', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 500 })));
    const { container } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Cobertura />
      </QueryClientProvider>,
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it('some da página quando nenhuma cidade tem parceiro', async () => {
    stubStats({ ...BASE, cities: [] });
    const { container } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Cobertura />
      </QueryClientProvider>,
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });
});
