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

  it('mostra o preço antigo riscado na promoção', () => {
    render(
      <PanelPreview
        kind="promo"
        headline="Oferta"
        body={null}
        items={[{ ...item('Pizza', 4990), oldPriceCents: 6990 }]}
        page={1}
      />,
    );
    expect(screen.getByText('R$ 69,90')).toHaveClass('line-through');
  });

  it('aviso mostra headline e corpo, sem preço', () => {
    render(<PanelPreview kind="notice" headline="Aceitamos Pix" body="Chave no balcão" items={[]} page={1} />);
    expect(screen.getByText('Aceitamos Pix')).toBeInTheDocument();
    expect(screen.getByText('Chave no balcão')).toBeInTheDocument();
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
  });
});
