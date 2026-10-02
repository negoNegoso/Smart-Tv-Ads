import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toaster';
import Fleet from '../fleet';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const minutosAtras = (min: number) => new Date(Date.now() - min * 60 * 1000).toISOString();

function tv(over: Record<string, unknown>) {
  return {
    id: 1, clientId: 7, clientName: 'Padaria Central', name: 'TV', location: null, showcase: false,
    lastSeenAt: minutosAtras(1), isOnline: true, appVersion: '1.9.0', outdated: false,
    updateRequestedAt: null,
    ...over,
  };
}

const PARQUE = {
  latestVersion: '1.9.0',
  devices: [
    tv({ id: 1, name: 'Balcão', location: 'Entrada' }),
    tv({ id: 2, name: 'Açougue', clientName: 'Mercado Bom', isOnline: false, lastSeenAt: minutosAtras(180), appVersion: '1.8.2', outdated: true }),
    tv({ id: 3, name: 'Depósito', isOnline: false, lastSeenAt: null, appVersion: null }),
    tv({ id: 4, name: 'Vitrine do site', showcase: true, appVersion: null }),
  ],
};

function stubFleet(body: unknown, status = 200) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL) => json(body, status));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** GET devolve o parque; POST do pedido responde com o status pedido e fica registrado. */
function stubComPedido(parque: unknown, statusDoPedido = 200) {
  const pedidos: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(typeof input === 'string' ? input : (input as Request).url ?? input);
      const method = init?.method ?? (typeof input === 'string' ? 'GET' : (input as Request).method ?? 'GET');
      if (method === 'POST' && url.includes('/fleet/update-requests')) {
        pedidos.push(JSON.parse(String(init?.body ?? '{}')));
        return statusDoPedido === 200 ? json({ requested: 1 }) : json({ error: 'boom' }, statusDoPedido);
      }
      return json(parque);
    }),
  );
  return pedidos;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Fleet />
      <Toaster />
    </QueryClientProvider>,
  );
}

const contagem = (id: string) => screen.getByTestId(`fleet-count-${id}`);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Parque de TVs', () => {
  it('busca o parque na API', async () => {
    const fetchMock = stubFleet(PARQUE);
    renderPage();
    await screen.findByText('Balcão');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/fleet');
  });

  it('conta total, online, offline e desatualizadas sem a vitrine', async () => {
    stubFleet(PARQUE);
    renderPage();
    await screen.findByText('Balcão');
    expect(contagem('total')).toHaveTextContent('3');
    expect(contagem('online')).toHaveTextContent('1');
    expect(contagem('offline')).toHaveTextContent('2');
    expect(contagem('outdated')).toHaveTextContent('1');
  });

  it('lista as versões em uso com a contagem de TVs', async () => {
    stubFleet(PARQUE);
    renderPage();
    const bloco = await screen.findByTestId('fleet-versions');
    expect(within(bloco).getByText('1.9.0')).toBeInTheDocument();
    expect(within(bloco).getByText('1.8.2')).toBeInTheDocument();
    expect(within(bloco).getByText('navegador')).toBeInTheDocument();
    expect(within(bloco).getAllByText('1 TV')).toHaveLength(3);
  });

  it('cada linha mostra status, empresa, último contato e versão', async () => {
    stubFleet(PARQUE);
    renderPage();
    const acougue = await screen.findByTestId('fleet-row-2');
    expect(acougue).toHaveTextContent('Açougue');
    expect(acougue).toHaveTextContent('Mercado Bom');
    expect(acougue).toHaveTextContent('Offline');
    expect(acougue).toHaveTextContent('há 3 h');
    expect(acougue).toHaveTextContent('1.8.2');
    expect(within(acougue).getByText('Desatualizada')).toBeInTheDocument();
    expect(within(acougue).getByRole('link', { name: 'Açougue' })).toHaveAttribute('href', '/devices/2');

    const deposito = screen.getByTestId('fleet-row-3');
    expect(deposito).toHaveTextContent('nunca conectou');
    expect(deposito).toHaveTextContent('navegador');

    expect(within(screen.getByTestId('fleet-row-4')).getByText('Vitrine')).toBeInTheDocument();
    expect(within(screen.getByTestId('fleet-row-1')).queryByText('Desatualizada')).not.toBeInTheDocument();
  });

  it('offline vem primeiro na lista', async () => {
    stubFleet(PARQUE);
    renderPage();
    await screen.findByText('Balcão');
    const ordem = screen.getAllByTestId(/^fleet-row-/).map((row) => row.getAttribute('data-testid'));
    expect(ordem).toEqual(['fleet-row-2', 'fleet-row-3', 'fleet-row-1', 'fleet-row-4']);
  });

  it('o filtro deixa só as TVs pedidas', async () => {
    stubFleet(PARQUE);
    renderPage();
    await screen.findByText('Balcão');

    await userEvent.selectOptions(screen.getByLabelText('Mostrar'), 'outdated');
    expect(screen.getAllByTestId(/^fleet-row-/)).toHaveLength(1);
    expect(screen.getByTestId('fleet-row-2')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Mostrar'), 'online');
    expect(screen.queryByTestId('fleet-row-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('fleet-row-1')).toBeInTheDocument();
  });

  it('sem a última versão, avisa e não marca ninguém', async () => {
    stubFleet({
      latestVersion: null,
      devices: [tv({ id: 2, name: 'Açougue', appVersion: '1.8.2', outdated: false })],
    });
    renderPage();
    await screen.findByText('Açougue');
    expect(screen.getByText(/Não foi possível consultar a última versão/)).toBeInTheDocument();
    expect(screen.queryByText('Desatualizada')).not.toBeInTheDocument();
  });

  it('parque vazio mostra zeros e a mensagem', async () => {
    stubFleet({ latestVersion: '1.9.0', devices: [] });
    renderPage();
    expect(await screen.findByText('Nenhuma TV cadastrada.')).toBeInTheDocument();
    expect(contagem('total')).toHaveTextContent('0');
  });

  it('filtro sem resultado diz que nenhuma TV se encaixa', async () => {
    stubFleet({ latestVersion: '1.9.0', devices: [tv({ id: 1, name: 'Balcão' })] });
    renderPage();
    await screen.findByText('Balcão');
    await userEvent.selectOptions(screen.getByLabelText('Mostrar'), 'offline');
    expect(screen.getByText('Nenhuma TV neste filtro.')).toBeInTheDocument();
  });

  it('erro da API mostra o aviso', async () => {
    stubFleet({ error: 'boom' }, 500);
    renderPage();
    expect(await screen.findByText('Não foi possível carregar o parque.')).toBeInTheDocument();
  });

  it('TV com app tem o botão de atualizar; TV no navegador não', async () => {
    stubFleet(PARQUE);
    renderPage();
    const balcao = await screen.findByTestId('fleet-row-1');
    expect(within(balcao).getByRole('button', { name: 'Atualizar agora' })).toBeInTheDocument();
    expect(within(screen.getByTestId('fleet-row-3')).queryByRole('button', { name: 'Atualizar agora' })).not.toBeInTheDocument();
  });

  it('"Atualizar agora" pede a atualização só daquela TV', async () => {
    const pedidos = stubComPedido(PARQUE);
    renderPage();
    const acougue = await screen.findByTestId('fleet-row-2');
    await userEvent.click(within(acougue).getByRole('button', { name: 'Atualizar agora' }));

    await waitFor(() => expect(pedidos).toEqual([{ deviceIds: [2] }]));
    expect(await screen.findByText('Pedido enviado. A TV checa no próximo minuto.')).toBeInTheDocument();
  });

  it('"Atualizar todas" pede confirmação e manda sem lista', async () => {
    const pedidos = stubComPedido(PARQUE);
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await screen.findByText('Balcão');
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar todas' }));

    expect(confirmar).toHaveBeenCalledWith('Mandar todas as TVs checarem atualização agora?');
    await waitFor(() => expect(pedidos).toEqual([{}]));
    expect(await screen.findByText('Pedido enviado. As TVs checam no próximo minuto.')).toBeInTheDocument();
  });

  it('"Atualizar todas" cancelado não manda nada', async () => {
    const pedidos = stubComPedido(PARQUE);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();
    await screen.findByText('Balcão');
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar todas' }));
    expect(pedidos).toEqual([]);
  });

  it('mostra há quanto tempo a atualização foi pedida', async () => {
    stubFleet({
      latestVersion: '1.9.0',
      devices: [
        tv({ id: 1, name: 'Balcão', updateRequestedAt: minutosAtras(2) }),
        tv({ id: 2, name: 'Açougue', updateRequestedAt: minutosAtras(40) }),
      ],
    });
    renderPage();
    const balcao = await screen.findByTestId('fleet-row-1');
    expect(balcao).toHaveTextContent('atualização pedida há 2 min');
    expect(screen.getByTestId('fleet-row-2')).not.toHaveTextContent('atualização pedida');
  });

  // "Atualizar todas" carimba também as TVs no navegador, que não têm app para
  // atualizar: o rótulo do pedido só faz sentido para quem tem app.
  it('TV no navegador não mostra atualização pedida', async () => {
    stubFleet({
      latestVersion: '1.9.0',
      devices: [
        tv({ id: 1, name: 'Balcão', updateRequestedAt: minutosAtras(2) }),
        tv({ id: 2, name: 'Vitrine', appVersion: null, updateRequestedAt: minutosAtras(2) }),
      ],
    });
    renderPage();
    expect(await screen.findByTestId('fleet-row-1')).toHaveTextContent('atualização pedida há 2 min');
    expect(screen.getByTestId('fleet-row-2')).not.toHaveTextContent('atualização pedida');
  });

  it('erro no pedido mostra o aviso', async () => {
    stubComPedido(PARQUE, 500);
    renderPage();
    const balcao = await screen.findByTestId('fleet-row-1');
    await userEvent.click(within(balcao).getByRole('button', { name: 'Atualizar agora' }));
    expect(await screen.findByText('Não foi possível enviar o pedido.')).toBeInTheDocument();
  });

  it('explica que as TVs se atualizam sozinhas e onde é preciso o OK', async () => {
    stubFleet(PARQUE);
    renderPage();
    expect(await screen.findByText(/As TVs se atualizam sozinhas em poucos minutos depois de cada release/)).toBeInTheDocument();
    expect(screen.getByText(/Em Android 11 ou anterior, alguém precisa apertar OK no controle/)).toBeInTheDocument();
  });

  it('parque vazio não oferece "Atualizar todas"', async () => {
    stubFleet({ latestVersion: '1.9.0', devices: [] });
    renderPage();
    await screen.findByText('Nenhuma TV cadastrada.');
    expect(screen.queryByRole('button', { name: 'Atualizar todas' })).not.toBeInTheDocument();
  });
});
