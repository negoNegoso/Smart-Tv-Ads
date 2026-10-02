import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeviceConnectionHistory } from '../device-connection-history';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function stubSessions(body: unknown, status = 200) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL) => json(body, status));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderHistory() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DeviceConnectionHistory deviceId={1} />
    </QueryClientProvider>,
  );
}

// Uma base só para o arquivo: com `Date.now()` a cada chamada, o milissegundo
// podia virar entre duas datas e um buraco de 10 h saía como 9h59.
const BASE = Date.now();
const horasAtras = (h: number) => new Date(BASE - h * 60 * 60 * 1000).toISOString();

afterEach(() => vi.unstubAllGlobals());

describe('DeviceConnectionHistory', () => {
  it('busca as sessões da TV', async () => {
    const fetchMock = stubSessions({ isOnline: false, sessions: [] });
    renderHistory();
    await screen.findByText(/Nenhuma conexão registrada/);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/devices/1/sessions');
  });

  it('alterna períodos no ar e fora do ar, com a duração de cada um', async () => {
    stubSessions({
      isOnline: true,
      sessions: [
        { startedAt: horasAtras(2), lastSeenAt: horasAtras(0) },
        { startedAt: horasAtras(26), lastSeenAt: horasAtras(12) },
      ],
    });
    renderHistory();

    expect(await screen.findAllByText('No ar')).toHaveLength(2);
    expect(screen.getAllByText('Fora do ar')).toHaveLength(1);
    // Sessão em andamento vai "até agora"; a queda entre as duas durou 10 h e
    // a sessão antiga, 14 h.
    expect(screen.getByText(/→ agora/)).toBeInTheDocument();
    expect(screen.getByText('(10h00)')).toBeInTheDocument();
    expect(screen.getByText('(14h00)')).toBeInTheDocument();
  });

  it('TV offline mostra a queda em aberto no topo', async () => {
    stubSessions({ isOnline: false, sessions: [{ startedAt: horasAtras(30), lastSeenAt: horasAtras(20) }] });
    renderHistory();

    const itens = await screen.findAllByRole('listitem');
    expect(itens[0]).toHaveTextContent('Fora do ar');
    expect(itens[0]).toHaveTextContent('→ agora');
    expect(itens[1]).toHaveTextContent('No ar');
  });

  it('sem sessão registrada explica que o registro é recente', async () => {
    stubSessions({ isOnline: true, sessions: [] });
    renderHistory();
    expect(await screen.findByText(/Nenhuma conexão registrada nos últimos 30 dias/)).toBeInTheDocument();
    expect(screen.queryByText('Fora do ar')).not.toBeInTheDocument();
  });

  // Resposta fora do contrato (proxy, versão antiga da API em cache): a
  // página da TV não pode cair por causa do histórico.
  it('resposta sem a lista de sessões cai no estado vazio', async () => {
    stubSessions({ qualquer: 'coisa' });
    renderHistory();
    expect(await screen.findByText(/Nenhuma conexão registrada/)).toBeInTheDocument();
  });

  it('erro da API mostra o aviso, sem derrubar a página', async () => {
    stubSessions({ error: 'boom' }, 500);
    renderHistory();
    expect(await screen.findByText('Não foi possível carregar o histórico.')).toBeInTheDocument();
  });
});
