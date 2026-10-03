import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WherePlayedTable } from '../where-played-table';
import { CampaignPiecesTable } from '../campaign-pieces-table';
import { OnlineDaysStrip } from '../online-days-strip';
import { DeviceCampaignsTable } from '../device-campaigns-table';

describe('WherePlayedTable', () => {
  it('mostra loja, TV, local, exibições e quando passou (hora de São Paulo)', () => {
    render(
      <WherePlayedTable
        items={[{
          deviceId: 2, storeName: 'Padaria Central', deviceName: 'Balcão', location: 'Entrada', plays: 1240,
          firstPlayedAt: '2026-09-01T11:02:00.000Z', lastPlayedAt: '2026-09-30T21:40:00.000Z',
        }]}
      />,
    );
    const linha = screen.getByRole('row', { name: /Padaria Central/ });
    expect(linha).toHaveTextContent('Balcão');
    expect(linha).toHaveTextContent('Entrada');
    expect(linha).toHaveTextContent('1.240');
    expect(linha.textContent).toMatch(/01\/09\/26.*08:02/);
    expect(linha.textContent).toMatch(/30\/09\/26.*18:40/);
  });

  it('sem local mostra traço; vazio mostra o aviso', () => {
    const { rerender } = render(
      <WherePlayedTable items={[{ deviceId: 3, storeName: 'Mercado', deviceName: 'Caixa', location: null, plays: 1, firstPlayedAt: '2026-09-01T11:00:00Z', lastPlayedAt: '2026-09-01T11:00:00Z' }]} />,
    );
    expect(screen.getByRole('row', { name: /Mercado/ })).toHaveTextContent('—');
    rerender(<WherePlayedTable items={[]} />);
    expect(screen.getByText('Nenhuma exibição até agora')).toBeInTheDocument();
  });
});

describe('CampaignPiecesTable', () => {
  it('mostra exibições, scans e taxa de cada peça, com a nota sobre scan', () => {
    render(<CampaignPiecesTable items={[{ announcementId: 9, title: 'Pão de mel', plays: 3001, scans: 41, scanRate: 0.0137 }]} />);
    const linha = screen.getByRole('row', { name: /Pão de mel/ });
    expect(linha).toHaveTextContent('3.001');
    expect(linha).toHaveTextContent('41');
    expect(linha).toHaveTextContent('1,37%');
    expect(screen.getByText(/Scan mede resposta, não alcance/)).toBeInTheDocument();
  });
});

describe('OnlineDaysStrip', () => {
  const dias = [
    { date: '2026-09-10', online: null },
    { date: '2026-09-11', online: false },
    { date: '2026-09-12', online: true },
  ];

  it('rotula cada dia para leitor de tela; o último é hoje, em andamento', () => {
    render(<OnlineDaysStrip days={dias} />);
    const lista = screen.getByRole('list', { name: 'Dias no ar' });
    const itens = within(lista).getAllByRole('listitem');
    expect(itens.map((item) => item.getAttribute('aria-label'))).toEqual([
      '10/09: sem dados',
      '11/09: parada',
      '12/09: funcionou (hoje, em andamento)',
    ]);
  });

  it('mostra a legenda', () => {
    render(<OnlineDaysStrip days={dias} />);
    expect(screen.getByText('Funcionou')).toBeInTheDocument();
    expect(screen.getByText('Parada')).toBeInTheDocument();
    expect(screen.getByText('Sem dados')).toBeInTheDocument();
    expect(screen.getByText('Hoje (em andamento)')).toBeInTheDocument();
  });
});

describe('DeviceCampaignsTable', () => {
  it('campanha com anunciante e o conteúdo sem campanha como "Conteúdo da loja"', () => {
    render(
      <DeviceCampaignsTable
        items={[
          { campaignId: 4, campaignName: 'Natal', advertiserName: 'Padaria Central', plays: 900 },
          { campaignId: null, campaignName: null, advertiserName: null, plays: 300 },
        ]}
      />,
    );
    expect(screen.getByRole('row', { name: /Natal/ })).toHaveTextContent('Padaria Central');
    expect(screen.getByRole('row', { name: /Conteúdo da loja/ })).toHaveTextContent('300');
  });

  it('vazio mostra o aviso do período', () => {
    render(<DeviceCampaignsTable items={[]} />);
    expect(screen.getByText('Nenhuma exibição no período')).toBeInTheDocument();
  });
});
