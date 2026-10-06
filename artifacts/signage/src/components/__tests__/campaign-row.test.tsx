import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CampaignRow, type CampaignRowData } from '../campaign-row';

const base: CampaignRowData = {
  id: 1,
  name: 'Café da manhã',
  startsAt: '2026-10-01T00:00:00.000Z',
  endsAt: '2026-10-31T00:00:00.000Z',
  targetMode: 'all',
  weekdays: [1, 2, 3, 4, 5],
  segmentNames: [],
  isActive: true,
};

describe('CampaignRow — horário', () => {
  it('mostra as faixas depois dos dias', () => {
    render(<CampaignRow campaign={{ ...base, timeWindows: [{ start: 420, end: 600 }] }} onToggle={vi.fn()} />);
    expect(screen.getByText(/Seg, Ter, Qua, Qui, Sex · 07:00–10:00/)).toBeInTheDocument();
  });

  it('dia todo não polui a linha', () => {
    render(<CampaignRow campaign={{ ...base, timeWindows: [] }} onToggle={vi.fn()} />);
    expect(screen.queryByText(/Dia todo/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d{2}:\d{2}–/)).not.toBeInTheDocument();
  });

  it('campanha sem o campo (portal, resposta antiga) não quebra', () => {
    render(<CampaignRow campaign={base} onToggle={vi.fn()} />);
    expect(screen.getByText('Café da manhã')).toBeInTheDocument();
  });
});
