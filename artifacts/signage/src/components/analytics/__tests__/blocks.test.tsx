import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AvailabilityChart, availabilityRows } from '../availability-chart';
import { HourlyChart, peakHour } from '../hourly-chart';
import { RankingList } from '../ranking-list';
import { AnnouncementsTable } from '../announcements-table';
import { BlockError } from '../block-error';

const dia = (date: string, activeDevices: number | null, totalDevices: number, plays = 0) => ({
  date,
  plays,
  scans: 0,
  activeDevices,
  totalDevices,
});

describe('availabilityRows', () => {
  it('dia sem histórico vira barra cinza de altura total, não zero', () => {
    const rows = availabilityRows([dia('2026-09-10', null, 4, 10), dia('2026-09-11', 3, 4, 20)]);
    expect(rows[0]).toMatchObject({ date: '2026-09-10', ativas: 0, semDados: 4, totalDevices: 4, plays: 10 });
    expect(rows[1]).toMatchObject({ date: '2026-09-11', ativas: 3, semDados: 0, totalDevices: 4, plays: 20 });
  });
});

describe('AvailabilityChart', () => {
  it('avisa desde quando há histórico quando existe dia sem dados', () => {
    render(<AvailabilityChart series={[dia('2026-09-10', null, 4), dia('2026-09-11', 3, 4)]} />);
    expect(screen.getByText(/sem dados/i)).toHaveTextContent('11/09');
  });

  it('sem dia sem dados, não mostra o aviso', () => {
    render(<AvailabilityChart series={[dia('2026-09-11', 3, 4)]} />);
    expect(screen.queryByText(/sem dados/i)).toBeNull();
  });

  it('nenhum dia com histórico: diz que ainda não há histórico', () => {
    render(<AvailabilityChart series={[dia('2026-09-10', null, 4)]} />);
    expect(screen.getByText(/ainda sem histórico de conexão/i)).toBeInTheDocument();
  });
});

describe('HourlyChart', () => {
  it('peakHour acha a hora com mais exibições; sem exibição, null', () => {
    expect(peakHour([{ hour: 7, plays: 3 }, { hour: 19, plays: 40 }, { hour: 20, plays: 40 }])).toEqual({ hour: 19, plays: 40 });
    expect(peakHour([{ hour: 0, plays: 0 }])).toBeNull();
  });

  it('mostra o horário de pico', () => {
    render(<HourlyChart hours={[{ hour: 19, plays: 40 }, { hour: 7, plays: 3 }]} />);
    expect(screen.getByText('Pico: 19h (40 exibições)')).toBeInTheDocument();
  });
});

describe('RankingList', () => {
  it('cada linha é um link, com barra proporcional ao maior', () => {
    render(
      <RankingList
        items={[
          { key: 1, label: 'Natal', sublabel: 'Padaria Central', value: 200, href: '/campaigns/1' },
          { key: 2, label: 'Páscoa', sublabel: 'Mercado Bom', value: 50, href: '/campaigns/2' },
        ]}
      />,
    );
    const natal = screen.getByRole('link', { name: /Natal/ });
    expect(natal).toHaveAttribute('href', '/campaigns/1');
    expect(natal).toHaveTextContent('200');
    expect(screen.getByTestId('ranking-bar-1')).toHaveStyle({ width: '100%' });
    expect(screen.getByTestId('ranking-bar-2')).toHaveStyle({ width: '25%' });
  });

  it('vazio mostra o aviso do período', () => {
    render(<RankingList items={[]} />);
    expect(screen.getByText('Nenhuma exibição no período')).toBeInTheDocument();
  });
});

describe('AnnouncementsTable', () => {
  it('mostra exibições, scans, taxa e tempo de cada peça', () => {
    render(
      <AnnouncementsTable
        items={[{ announcementId: 9, title: 'Pão de mel', plays: 3001, scans: 41, scanRate: 0.0137, durationSeconds: 3900 }]}
      />,
    );
    const linha = screen.getByRole('row', { name: /Pão de mel/ });
    expect(linha).toHaveTextContent('3.001');
    expect(linha).toHaveTextContent('41');
    expect(linha).toHaveTextContent('1,37%');
    expect(linha).toHaveTextContent('1h 5m');
    expect(screen.getByText(/Scan mede resposta, não alcance/)).toBeInTheDocument();
  });

  it('vazio mostra o aviso do período', () => {
    render(<AnnouncementsTable items={[]} />);
    expect(screen.getByText('Nenhuma exibição no período')).toBeInTheDocument();
  });
});

describe('BlockError', () => {
  it('chama o retry do bloco', async () => {
    const onRetry = vi.fn();
    render(<BlockError onRetry={onRetry} />);
    expect(screen.getByText('Não foi possível carregar')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
