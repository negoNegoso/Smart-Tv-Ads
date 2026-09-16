import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LANDING } from '@/lib/landing-content';
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
  const utils = render(
    <QueryClientProvider client={client}>
      <Cobertura />
    </QueryClientProvider>,
  );
  return { client, ...utils };
}

// O container vazio só prova a regra ("sem dado, sem seção") depois que a
// consulta terminou: antes disso ele está vazio só porque o dado ainda não
// chegou, e a asserção passaria mesmo com uma seção quebrada que aparecesse
// depois do primeiro render.
async function esperarConsulta(client: QueryClient) {
  await waitFor(() => {
    expect(client.getQueryState(['public-stats'])?.status).not.toBe('pending');
  });
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
    // Consulta por papel (heading) evita ambiguidade com o botão homônimo na
    // lista abaixo — ambos mostram "Registro", mas em papéis diferentes.
    expect(
      await screen.findByRole('heading', { name: 'Registro', level: 3 }),
    ).toBeInTheDocument();
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
    expect(screen.getByRole('heading', { name: 'Miracatu', level: 3 })).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('não deixa clicar em cidade sem parceiro', async () => {
    stubStats({ ...BASE, cities: [{ ibge: '3542602', companies: 9 }] });
    renderSecao();
    // Mesma ambiguidade do primeiro teste: com só um parceiro, "Registro"
    // aparece no heading do painel e no botão da lista. Espera pelo heading.
    await screen.findByRole('heading', { name: 'Registro', level: 3 });
    expect(screen.queryByRole('button', { name: /Tapiraí/ })).not.toBeInTheDocument();
  });

  it('some da página quando a API falha', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 500 })));
    const { container, client } = renderSecao();
    await esperarConsulta(client);
    expect(container).toBeEmptyDOMElement();
  });

  it('some da página quando nenhuma cidade tem parceiro', async () => {
    stubStats({ ...BASE, cities: [] });
    const { container, client } = renderSecao();
    await esperarConsulta(client);
    expect(container).toBeEmptyDOMElement();
  });

  it('não mostra telas ativas quando o número é zero', async () => {
    // Cidade parceira presente — a seção deve aparecer — mas activeScreens
    // zerado (madrugada, queda de internet) não deve virar "0 telas ativas".
    stubStats({ ...BASE, activeScreens: 0, cities: [{ ibge: '3542602', companies: 9 }] });
    renderSecao();
    await screen.findByRole('heading', { name: 'Registro', level: 3 });
    expect(screen.queryByText(LANDING.cobertura.screensLabel)).not.toBeInTheDocument();
  });
});
