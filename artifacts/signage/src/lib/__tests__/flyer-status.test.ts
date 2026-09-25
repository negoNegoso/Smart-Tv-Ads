import { describe, expect, it } from 'vitest';
import { panelStatusBadges } from '../flyer-status';

const now = new Date('2026-09-24T12:00:00Z');
const campaign = (startsAt: string, endsAt: string, isActive = true) => ({
  id: 1,
  name: 'C',
  startsAt,
  endsAt,
  isActive,
});
const labels = (p: Parameters<typeof panelStatusBadges>[0]) => panelStatusBadges(p, now).map((b) => b.label);

describe('panelStatusBadges', () => {
  it('rascunho', () => {
    expect(labels({ status: 'draft', publishedAt: null, artOutdated: false, publishedCampaign: null })).toEqual([
      'Rascunho',
    ]);
  });

  it('na loja', () => {
    expect(
      labels({ status: 'published', publishedAt: '2026-09-20T00:00:00Z', artOutdated: false, publishedCampaign: null }),
    ).toEqual(['Na loja']);
  });

  it('agendado, no ar e encerrado pela campanha', () => {
    const base = { status: 'published' as const, publishedAt: '2026-09-20T00:00:00Z', artOutdated: false };
    expect(labels({ ...base, publishedCampaign: campaign('2026-09-25T00:00:00Z', '2026-09-30T00:00:00Z') })[0]).toMatch(
      /^Agendado/,
    );
    expect(labels({ ...base, publishedCampaign: campaign('2026-09-20T00:00:00Z', '2026-09-30T00:00:00Z') })[0]).toMatch(
      /^No ar/,
    );
    expect(labels({ ...base, publishedCampaign: campaign('2026-09-01T00:00:00Z', '2026-09-10T00:00:00Z') })[0]).toMatch(
      /^Encerrado/,
    );
    expect(
      labels({ ...base, publishedCampaign: campaign('2026-09-20T00:00:00Z', '2026-09-30T00:00:00Z', false) })[0],
    ).toMatch(/^Encerrado/);
  });

  it('datas só-dia da campanha saem no próprio dia (UTC, como no admin)', () => {
    const base = { status: 'published' as const, publishedAt: '2026-09-20T00:00:00Z', artOutdated: false };
    expect(labels({ ...base, publishedCampaign: campaign('2026-09-20', '2026-09-27') })[0]).toBe('No ar até 27/09');
    expect(labels({ ...base, publishedCampaign: campaign('2026-09-27', '2026-09-30') })[0]).toBe(
      'Agendado — entra no ar 27/09',
    );
  });

  it('arte desatualizada vem junto', () => {
    expect(
      labels({ status: 'published', publishedAt: '2026-09-20T00:00:00Z', artOutdated: true, publishedCampaign: null }),
    ).toEqual(['Na loja', 'Arte desatualizada']);
  });
});
