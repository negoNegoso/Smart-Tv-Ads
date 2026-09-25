import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CampaignFormDialog } from '../campaign-form-dialog';

const advertiser = { id: 3, name: 'Mercado', company: 'Mercado Bom' };

function renderDialog(campaign: Parameters<typeof CampaignFormDialog>[0]['campaign'] = null) {
  return render(
    <CampaignFormDialog
      open
      onOpenChange={vi.fn()}
      advertisers={[advertiser] as never}
      announcements={[{ id: 10, title: 'Peça' }]}
      devices={[]}
      segments={[]}
      campaign={campaign}
      lockedAdvertiserId={3}
      onSaved={vi.fn()}
    />,
  );
}

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
});
