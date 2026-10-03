import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface FakeMe {
  isAdmin?: boolean;
  roles?: string[];
}

function stubSessao({ isAdmin = false, roles = [] }: FakeMe) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('api/auth/me')) {
      return new Response(
        JSON.stringify({
          authenticated: true,
          isAdmin,
          roles,
          clientIds: roles.includes('client') ? [7] : [],
          advertiserIds: roles.includes('advertiser') ? [3] : [],
          mustChangePassword: false,
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response('{}', { status: 500, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// O QueryClient do App é de módulo: sem recarregar o módulo, a sessão ('auth')
// de um teste vazaria para o seguinte.
async function abrir(path: string) {
  vi.resetModules();
  const { default: App } = await import('../App');
  window.history.replaceState(null, '', path);
  render(<App />);
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('rotas do portal', () => {
  it('cliente em / vai para Minhas TVs', async () => {
    stubSessao({ roles: ['client'] });
    await abrir('/');
    await waitFor(() => expect(window.location.pathname).toBe('/portal/tvs'));
    expect(await screen.findByRole('link', { name: /Meus painéis/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Desempenho/ })).not.toBeInTheDocument();
  });

  it('quem tem os dois papéis vê os dois grupos e começa no anunciante', async () => {
    stubSessao({ roles: ['client', 'advertiser'] });
    await abrir('/');
    await waitFor(() => expect(window.location.pathname).toBe('/portal/anunciante'));
    // Links e não rótulos de grupo: "Anunciante"/"Cliente" podem aparecer
    // também no conteúdo da página.
    expect(await screen.findByRole('link', { name: /Desempenho/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Minhas TVs/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Meus painéis/ })).toBeInTheDocument();
  });

  it('anunciante em rota de cliente volta para o desempenho', async () => {
    stubSessao({ roles: ['advertiser'] });
    await abrir('/portal/tvs');
    await waitFor(() => expect(window.location.pathname).toBe('/portal/anunciante'));
  });

  it('F5 no editor abre o mesmo painel', async () => {
    const fetchMock = stubSessao({ roles: ['client'] });
    await abrir('/portal/paineis/7');
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('api/portal/client/panels/7'))).toBe(true),
    );
    expect(window.location.pathname).toBe('/portal/paineis/7');
  });

  it.each(['abc', '0', '-1'])('id de painel inválido (%s) volta para a lista', async (id) => {
    stubSessao({ roles: ['client'] });
    await abrir(`/portal/paineis/${id}`);
    await waitFor(() => expect(window.location.pathname).toBe('/portal/paineis'));
  });

  it('Minha conta abre para qualquer papel', async () => {
    stubSessao({ roles: ['advertiser'] });
    await abrir('/portal/conta');
    expect(await screen.findByRole('heading', { name: 'Minha conta' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/portal/conta');
  });

  it('relatório de campanha com id inválido volta para o desempenho', async () => {
    stubSessao({ roles: ['advertiser'] });
    await abrir('/portal/anunciante/campanhas/abc');
    await waitFor(() => expect(window.location.pathname).toBe('/portal/anunciante'));
  });

  it('cliente sem papel de anunciante não abre relatório de campanha', async () => {
    stubSessao({ roles: ['client'] });
    await abrir('/portal/anunciante/campanhas/4');
    await waitFor(() => expect(window.location.pathname).toBe('/portal/tvs'));
  });
});

describe('rotas do admin', () => {
  it('a raiz abre a Visão geral', async () => {
    stubSessao({ isAdmin: true });
    await abrir('/');
    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('/analytics redireciona para a raiz', async () => {
    stubSessao({ isAdmin: true });
    await abrir('/analytics');
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeInTheDocument();
  });
});
