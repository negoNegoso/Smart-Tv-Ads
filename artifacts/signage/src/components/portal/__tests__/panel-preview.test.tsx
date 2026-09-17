import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PanelPreview } from '../panel-preview';

const item = (name: string, priceCents: number) => ({
  name, description: null, priceCents, oldPriceCents: null, category: 'Lanches', imageUrl: null,
});

describe('PanelPreview', () => {
  it('mostra preço formatado em real', () => {
    render(<PanelPreview kind="menu" headline={null} body={null} items={[item('Coxinha', 750)]} page={1} />);
    expect(screen.getByText('R$ 7,50')).toBeInTheDocument();
  });

  it('promoção price mostra DE/POR e o preço grande', () => {
    render(
      <PanelPreview
        kind="promo"
        headline={null}
        body={null}
        items={[{ ...item('Pizza', 4990), oldPriceCents: 6990 }]}
        page={1}
      />,
    );
    expect(screen.getByText('PROMOÇÃO')).toBeInTheDocument();
    expect(screen.getByText('DE')).toBeInTheDocument();
    expect(screen.getByText('69,90')).toBeInTheDocument();
    expect(screen.getByText('49,90')).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('promoção percent mostra a porcentagem', () => {
    render(
      <PanelPreview
        kind="promo"
        headline={null}
        body={null}
        promoStyle="percent"
        items={[{ ...item('Cheesecake', 899), oldPriceCents: 1499 }]}
        page={1}
      />,
    );
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('DE R$ 14,99 POR R$ 8,99')).toBeInTheDocument();
  });

  it('promoção usa a cor escolhida no fundo', () => {
    const { container } = render(
      <PanelPreview
        kind="promo"
        headline={null}
        body={null}
        accentColor="#2563eb"
        items={[item('Pizza', 4990)]}
        page={1}
      />,
    );
    const bg = container.querySelector('img[data-promo-background]');
    expect(decodeURIComponent(bg!.getAttribute('src')!)).toContain('fill="#2563EB"');
  });

  it('aviso mostra headline e corpo, sem preço', () => {
    render(<PanelPreview kind="notice" headline="Aceitamos Pix" body="Chave no balcão" items={[]} page={1} />);
    expect(screen.getByText('Aceitamos Pix')).toBeInTheDocument();
    expect(screen.getByText('Chave no balcão')).toBeInTheDocument();
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
  });
});
