import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ParearView } from '../parear';

const KEY = 'A1B2C3D4E5F6A7B8';
const COMPANY = { id: 5, name: 'Padaria Central', clientId: 3 };
const DEVICE = {
  id: 7, clientId: 3, clientName: 'Padaria Central', name: 'TV do caixa',
  location: null, deviceKey: KEY, lastSeenAt: null, createdAt: '2026-09-18T12:00:00Z',
};

type Reply = { status: number; body: unknown };

function stubApi(handler: (url: string, init?: RequestInit) => Reply) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const { status, body } = handler(String(url), init);
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderView(rawKey = KEY) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ParearView rawKey={rawKey} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('ParearView', () => {
  it('key inválida avisa sem chamar a API', () => {
    const fetchMock = stubApi(() => ({ status: 200, body: {} }));
    renderView('CURTA');
    expect(screen.getByText('Código de TV inválido.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('TV já vinculada mostra a empresa', async () => {
    stubApi(() => ({ status: 200, body: DEVICE }));
    renderView('a1b2-c3d4-e5f6-a7b8');
    expect(await screen.findByText(/já está vinculada a/)).toBeInTheDocument();
    expect(screen.getByText('Padaria Central')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver TV' })).toHaveAttribute('href', '/devices/7');
  });

  it('TV livre mostra o formulário com o código em blocos', async () => {
    stubApi(() => ({ status: 404, body: { error: 'Device not found' } }));
    renderView();
    expect(await screen.findByRole('heading', { name: 'Vincular TV' })).toBeInTheDocument();
    expect(screen.getByText('A1B2-C3D4-E5F6-A7B8')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vincular TV' })).toBeDisabled();
  });

  it('envia empresa, nome, local e a key', async () => {
    const fetchMock = stubApi((url, init) => {
      if (url.includes('/devices/by-key/')) return { status: 404, body: {} };
      if (url.includes('/companies')) return { status: 200, body: [COMPANY] };
      if (init?.method === 'POST') return { status: 201, body: DEVICE };
      return { status: 500, body: {} };
    });
    renderView();

    fireEvent.change(await screen.findByLabelText('Empresa'), { target: { value: 'pad' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Padaria Central' }));
    fireEvent.change(screen.getByLabelText('Nome da TV'), { target: { value: 'TV do caixa' } });
    fireEvent.change(screen.getByLabelText('Local (opcional)'), { target: { value: 'Balcão' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vincular TV' }));

    expect(await screen.findByText('TV vinculada! Ela começa a exibir em alguns segundos.')).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(String(post[1]!.body))).toEqual({
      clientId: 3, name: 'TV do caixa', location: 'Balcão', deviceKey: KEY,
    });
    expect(screen.getByRole('link', { name: 'Ver empresa' })).toHaveAttribute('href', '/companies/5');
  });

  it('busca só empresas com perfil de TV', async () => {
    const fetchMock = stubApi((url) =>
      url.includes('/devices/by-key/') ? { status: 404, body: {} } : { status: 200, body: [] },
    );
    renderView();
    fireEvent.change(await screen.findByLabelText('Empresa'), { target: { value: 'xyz' } });
    expect(await screen.findByText(/Nenhuma empresa com perfil de TV encontrada/)).toBeInTheDocument();
    const companiesCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/companies'))!;
    expect(String(companiesCall[0])).toContain('role=client');
    expect(String(companiesCall[0])).toContain('q=xyz');
  });

  it('409 troca para "já vinculada"', async () => {
    let linked = false;
    stubApi((url, init) => {
      if (url.includes('/devices/by-key/')) return linked ? { status: 200, body: DEVICE } : { status: 404, body: {} };
      if (url.includes('/companies')) return { status: 200, body: [COMPANY] };
      if (init?.method === 'POST') {
        linked = true;
        return { status: 409, body: { error: 'Esta TV já está vinculada.' } };
      }
      return { status: 500, body: {} };
    });
    renderView();

    fireEvent.change(await screen.findByLabelText('Empresa'), { target: { value: 'pad' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Padaria Central' }));
    fireEvent.change(screen.getByLabelText('Nome da TV'), { target: { value: 'TV' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vincular TV' }));

    await waitFor(() => expect(screen.getByText(/já está vinculada a/)).toBeInTheDocument());
  });
});
