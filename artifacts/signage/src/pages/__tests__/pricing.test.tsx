import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toaster';
import Pricing from '../pricing';

function json(status: number, body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
}

const TABELA = {
  pricePerTvCents: 1500,
  minMonthlyCents: 5000,
  quarterlyDiscountPct: 10,
  annualDiscountPct: 20,
  updatedAt: '2026-10-08T12:00:00.000Z',
};

const DICA = 'Hoje a landing anuncia R$ 150 por mês para a rede toda.';

function stub(row: unknown, put: () => Promise<Response> = () => json(200, TABELA)) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/pricing') && init?.method === 'PUT') return put();
    if (u.includes('/pricing')) return json(200, row);
    return json(404, { error: 'não mockado' });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Pricing />
      <Toaster />
    </QueryClientProvider>,
  );
}

const puts = (fetchMock: ReturnType<typeof stub>) =>
  (fetchMock.mock.calls as unknown as [string, RequestInit | undefined][]).filter(([, init]) => init?.method === 'PUT');

const normaliza = (s: string | null) => (s ?? '').replace(/\s/g, ' ');

afterEach(() => vi.unstubAllGlobals());

describe('Pricing', () => {
  it('sem tabela: campos vazios e a dica da landing', async () => {
    stub(null);
    renderPage();
    expect(await screen.findByText(DICA)).toBeInTheDocument();
    expect(screen.getByLabelText('Preço por TV por mês')).toHaveValue('');
    expect(screen.getByLabelText('Valor mínimo por mês')).toHaveValue('');
    expect(screen.getByLabelText('Desconto trimestral (%)')).toHaveValue('');
    expect(screen.getByLabelText('Desconto anual (%)')).toHaveValue('');
  });

  it('com tabela: preenche os campos e esconde a dica', async () => {
    stub(TABELA);
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Preço por TV por mês')).toHaveValue('15,00'));
    expect(screen.getByLabelText('Valor mínimo por mês')).toHaveValue('50,00');
    expect(screen.getByLabelText('Desconto trimestral (%)')).toHaveValue('10');
    expect(screen.getByLabelText('Desconto anual (%)')).toHaveValue('20');
    expect(screen.queryByText(DICA)).not.toBeInTheDocument();
  });

  it('exemplo ao vivo acompanha os campos', async () => {
    stub(TABELA);
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Preço por TV por mês')).toHaveValue('15,00'));
    expect(normaliza(screen.getByTestId('exemplo-preco').textContent)).toBe(
      '10 TVs × 2 inserções, anual: R$ 240,00 por mês (R$ 2.880,00 no ano)',
    );
    const preco = screen.getByLabelText('Preço por TV por mês');
    await userEvent.clear(preco);
    await userEvent.type(preco, '20');
    expect(normaliza(screen.getByTestId('exemplo-preco').textContent)).toBe(
      '10 TVs × 2 inserções, anual: R$ 320,00 por mês (R$ 3.840,00 no ano)',
    );
  });

  it('salva com os centavos certos e avisa', async () => {
    const fetchMock = stub(null);
    renderPage();
    await screen.findByText(DICA);
    await userEvent.type(screen.getByLabelText('Preço por TV por mês'), '1.234,56');
    await userEvent.type(screen.getByLabelText('Valor mínimo por mês'), '0');
    await userEvent.type(screen.getByLabelText('Desconto trimestral (%)'), '10');
    await userEvent.type(screen.getByLabelText('Desconto anual (%)'), '20');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar preços' }));

    await waitFor(() => expect(puts(fetchMock)).toHaveLength(1));
    expect(JSON.parse(puts(fetchMock)[0][1]!.body as string)).toEqual({
      pricePerTvCents: 123456,
      minMonthlyCents: 0,
      quarterlyDiscountPct: 10,
      annualDiscountPct: 20,
    });
    expect(await screen.findByText('Preços salvos.')).toBeInTheDocument();
  });

  it('valor inválido desabilita o botão e não envia', async () => {
    const fetchMock = stub(null);
    renderPage();
    await screen.findByText(DICA);
    await userEvent.type(screen.getByLabelText('Preço por TV por mês'), 'abc');
    expect(screen.getByText('Valor inválido.')).toBeInTheDocument();
    const botao = screen.getByRole('button', { name: 'Salvar preços' });
    expect(botao).toBeDisabled();
    await userEvent.click(botao);
    expect(puts(fetchMock)).toHaveLength(0);
  });

  it('erro do servidor vira toast e mantém o digitado', async () => {
    const fetchMock = stub(null, () => json(400, { error: 'Desconto entre 0% e 90%.' }));
    renderPage();
    await screen.findByText(DICA);
    await userEvent.type(screen.getByLabelText('Preço por TV por mês'), '15');
    await userEvent.type(screen.getByLabelText('Desconto anual (%)'), '20');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar preços' }));

    expect(await screen.findByText('Desconto entre 0% e 90%.')).toBeInTheDocument();
    expect(puts(fetchMock)).toHaveLength(1);
    expect(screen.getByLabelText('Preço por TV por mês')).toHaveValue('15');
    expect(screen.getByLabelText('Desconto anual (%)')).toHaveValue('20');
  });
});
