import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompanyFormDialog } from '../company-form-dialog';

const PAULISTA = {
  cep: '01310100', street: 'Avenida Paulista', district: 'Bela Vista', city: 'São Paulo',
  state: 'SP', cityIbge: '3550308', lat: -23.56, lng: -46.65,
};

function json(status: number, body: unknown) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
}

/** Responde por trecho de URL; o que não casar vira 404. */
function stubFetch(routes: Record<string, () => Promise<unknown>>) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const key = Object.keys(routes).find((k) => String(url).includes(k));
    return key ? routes[key]() : json(404, { error: 'não mockado' });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderDialog(onSaved = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CompanyFormDialog open onOpenChange={() => {}} onSaved={onSaved} />
    </QueryClientProvider>,
  );
  return onSaved;
}

afterEach(() => vi.unstubAllGlobals());

describe('CompanyFormDialog', () => {
  it('preenche o endereço quando o CEP tem 8 dígitos', async () => {
    const fetchMock = stubFetch({ '/segments': () => json(200, []), '/cep/01310100': () => json(200, PAULISTA) });
    renderDialog();
    await userEvent.type(screen.getByLabelText('CEP'), '01310-100');
    await waitFor(() => expect(screen.getByLabelText('Rua')).toHaveValue('Avenida Paulista'));
    expect(screen.getByLabelText('Bairro')).toHaveValue('Bela Vista');
    expect(screen.getByLabelText('Cidade')).toHaveValue('São Paulo');
    expect(screen.getByLabelText('UF')).toHaveValue('SP');
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('api/cep/01310100'), expect.anything());
  });

  it('avisa e deixa digitar quando o CEP não existe', async () => {
    stubFetch({
      '/segments': () => json(200, []),
      '/cep/': () => json(404, { error: 'CEP não encontrado. Preencha o endereço manualmente.' }),
    });
    renderDialog();
    await userEvent.type(screen.getByLabelText('CEP'), '99999999');
    expect(await screen.findByText('CEP não encontrado. Preencha o endereço manualmente.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Rua'), 'Rua Nova');
    expect(screen.getByLabelText('Rua')).toHaveValue('Rua Nova');
  });

  it('não envia sem papel marcado', async () => {
    const fetchMock = stubFetch({ '/segments': () => json(200, []) });
    renderDialog();
    await userEvent.type(screen.getByLabelText('Nome'), 'Padaria Central');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar empresa' }));
    expect(await screen.findByText('Marque cliente e/ou anunciante.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('api/companies'), expect.anything());
  });

  it('envia o cadastro com papéis, endereço e coordenadas', async () => {
    const saved = { id: 5, name: 'Padaria Central' };
    const fetchMock = stubFetch({
      '/segments': () => json(200, []),
      '/cep/01310100': () => json(200, PAULISTA),
      '/companies': () => json(201, saved),
    });
    const onSaved = renderDialog();
    await userEvent.type(screen.getByLabelText('Nome'), 'Padaria Central');
    await userEvent.click(screen.getByLabelText('Cliente (tem TV)'));
    await userEvent.type(screen.getByLabelText('CEP'), '01310100');
    await waitFor(() => expect(screen.getByLabelText('Rua')).toHaveValue('Avenida Paulista'));
    await userEvent.type(screen.getByLabelText('Número'), '1000');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar empresa' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    const [, init] = fetchMock.mock.calls.find(([url]) => String(url).includes('api/companies'))!;
    expect(JSON.parse(init!.body as string)).toMatchObject({
      name: 'Padaria Central', isClient: true, isAdvertiser: false, cep: '01310100',
      street: 'Avenida Paulista', number: '1000', state: 'SP', lat: -23.56, lng: -46.65, status: 'active',
    });
  });
});
