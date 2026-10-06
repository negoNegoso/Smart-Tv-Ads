import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampaignFormDialog } from '../campaign-form-dialog';

const advertiser = { id: 3, name: 'Mercado', company: 'Mercado Bom' };
const devices = [
  { id: 1, name: 'TV balcão', location: null, clientName: 'Mercado Bom' },
  { id: 2, name: 'TV caixa', location: null, clientName: 'Mercado Rival' },
];
const segments = [{ id: 5, name: 'Mercado' }, { id: 6, name: 'Farmácia' }];

function json(status: number, body: unknown) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
}

function preview(over: Record<string, unknown> = {}) {
  return {
    reachedCount: 1, totalDevices: 2, competitorDeviceIds: [2],
    advertiserSegmentId: 5, advertiserHasSegment: true, advertiserCompanyId: 30, ...over,
  };
}

function renderDialog(campaign: Parameters<typeof CampaignFormDialog>[0]['campaign'] = null) {
  return render(
    <CampaignFormDialog
      open
      onOpenChange={vi.fn()}
      advertisers={[advertiser] as never}
      announcements={[{ id: 10, title: 'Peça' }]}
      devices={devices}
      segments={segments}
      campaign={campaign}
      lockedAdvertiserId={3}
      onSaved={vi.fn()}
    />,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('CampaignFormDialog', () => {
  // Campanha pode existir só para receber o encarte do lojista: nenhuma peça
  // marcada não bloqueia criar nem salvar.
  it('publicar fica habilitado sem nenhuma peça marcada', async () => {
    renderDialog();
    expect(await screen.findByRole('button', { name: 'Publicar campanha' })).toBeEnabled();
  });

  it('salvar alterações fica habilitado em campanha sem peças', async () => {
    renderDialog({
      id: 1, advertiserId: 3, name: 'Só encarte', contractValue: null,
      startsAt: '2026-09-20T00:00:00.000Z', endsAt: '2026-09-27T00:00:00.000Z', announcementIds: [],
    } as never);
    expect(await screen.findByRole('button', { name: 'Salvar alterações' })).toBeEnabled();
  });

  it('mostra quantas TVs a campanha alcança', async () => {
    const fetchMock = vi.fn(() => json(200, preview()));
    vi.stubGlobal('fetch', fetchMock);
    renderDialog();
    expect(await screen.findByTestId('reach-summary')).toHaveTextContent('Alcança 1 de 2 TVs');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ advertiserId: 3, targetMode: 'all', deviceIds: [], segmentIds: [] });
  });

  it('avisa alcance zero sem travar o salvar', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(200, preview({ reachedCount: 0 }))));
    renderDialog();
    expect(await screen.findByText('Nenhuma TV vai exibir esta campanha.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar campanha' })).toBeEnabled();
  });

  it('marca a TV do concorrente e o segmento do próprio anunciante', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(200, preview())));
    renderDialog();
    await userEvent.click(screen.getByLabelText(/TVs escolhidas/));
    expect(await screen.findByText('concorrente · não toca aqui')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/Por segmento/));
    expect(await screen.findByText('mesmo ramo do anunciante · só toca nas TVs dele')).toBeInTheDocument();
  });

  it('alerta anunciante sem segmento com link para completar', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(200, preview({ advertiserHasSegment: false, advertiserSegmentId: null, competitorDeviceIds: [] }))));
    renderDialog();
    expect(await screen.findByText(/Anunciante sem segmento: a regra do concorrente não vale/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Completar cadastro' })).toHaveAttribute('href', '/companies/30');
  });

  it('falha da prévia some com a linha e não trava o formulário', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(500, { error: 'falhou' })));
    renderDialog();
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.queryByTestId('reach-summary')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar campanha' })).toBeEnabled();
  });

  it('resposta velha chegando depois não sobrescreve a do alvo atual', async () => {
    let releaseOld!: () => void;
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (body.targetMode === 'all') {
        return new Promise((resolve) => {
          releaseOld = () => resolve({ ok: true, status: 200, json: () => Promise.resolve(preview({ reachedCount: 2 })) });
        });
      }
      return json(200, preview({ reachedCount: 0 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderDialog();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByLabelText(/TVs escolhidas/));
    expect(await screen.findByTestId('reach-summary')).toHaveTextContent('Alcança 0 de 2 TVs');
    releaseOld();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByTestId('reach-summary')).toHaveTextContent('Alcança 0 de 2 TVs');
  });

  it('adiciona e remove faixa de horário', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(200, preview())));
    renderDialog();
    expect(screen.getByText(/Dia todo\. Sem faixa, roda o dia inteiro/)).toBeInTheDocument();
    expect(screen.getByText(/Horário de Brasília\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '+ faixa' }));
    expect(screen.getByRole('combobox', { name: 'Início da faixa 1' })).toHaveValue('480');
    expect(screen.getByRole('combobox', { name: 'Fim da faixa 1' })).toHaveValue('720');
    expect(screen.getByText(/08:00–12:00/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remover faixa' }));
    expect(screen.queryByRole('combobox', { name: 'Início da faixa 1' })).not.toBeInTheDocument();
  });

  it('"+ faixa" some na quarta faixa', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(200, preview())));
    renderDialog();
    for (let i = 0; i < 4; i++) await userEvent.click(screen.getByRole('button', { name: '+ faixa' }));
    expect(screen.queryByRole('button', { name: '+ faixa' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Remover faixa' })).toHaveLength(4);
  });

  it('faixa com fim antes do início avisa e trava o publicar', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(200, preview())));
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: '+ faixa' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Fim da faixa 1' }), '480');
    expect(screen.getByText('Fim precisa ser depois do início')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar campanha' })).toBeDisabled();
  });
});
