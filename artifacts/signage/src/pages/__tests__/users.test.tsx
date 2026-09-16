import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Users from '../users';

function json(status: number, body: unknown) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
}

const ADMIN = {
  id: 1, email: 'yuri@ex.com', name: 'Yuri', isAdmin: true, isActive: true,
  mustChangePassword: false, clientIds: [], advertiserIds: [],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Users />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('Users', () => {
  it('mostra nome e marca de administrador', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => json(200, String(url).includes('/users') ? [ADMIN] : [])));
    renderPage();
    expect(await screen.findByText('Yuri')).toBeInTheDocument();
    expect(screen.getByText('Administrador')).toBeInTheDocument();
  });

  it('cria conta com nome e administrador', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) =>
      init?.method === 'POST' ? json(201, ADMIN) : json(200, []),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    await userEvent.type(screen.getByLabelText('Nome'), 'Yuri');
    await userEvent.type(screen.getByLabelText('Email'), 'yuri@ex.com');
    await userEvent.type(screen.getByLabelText('Senha temporária (mín. 8)'), '12345678');
    await userEvent.click(screen.getByLabelText('Administrador (acesso total)'));
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('api/users'), expect.objectContaining({ method: 'POST' })));
    const [, init] = fetchMock.mock.calls.find(([, i]) => i?.method === 'POST')!;
    expect(JSON.parse(String(init!.body))).toMatchObject({ name: 'Yuri', isAdmin: true, email: 'yuri@ex.com' });
  });
});
