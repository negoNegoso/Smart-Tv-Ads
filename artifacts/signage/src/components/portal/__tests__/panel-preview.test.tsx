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

  it('promoção corta o selo em 40 caracteres, igual ao servidor', () => {
    const headline = 'Promoção imperdível de fim de semana para clientes vip hojex';
    render(
      <PanelPreview kind="promo" headline={headline} body={null} items={[item('Pizza', 4990)]} page={1} />,
    );
    expect(screen.getByText('PROMOÇÃO IMPERDÍVEL DE FIM DE SEMANA PA…')).toBeInTheDocument();
    expect(screen.queryByText(headline.toUpperCase())).not.toBeInTheDocument();
  });

  it('promoção corta o nome do item em 20 caracteres, igual ao servidor', () => {
    const name = 'Cheesecake de morango com calda quente';
    render(<PanelPreview kind="promo" headline={null} body={null} items={[item(name, 4990)]} page={1} />);
    expect(screen.getByText('CHEESECAKE DE MORAN…')).toBeInTheDocument();
    expect(screen.queryByText(name.toUpperCase())).not.toBeInTheDocument();
  });

  it('promoção corta o corpo em 160 caracteres, igual ao servidor', () => {
    const body = 'a'.repeat(200);
    render(<PanelPreview kind="promo" headline={null} body={body} items={[item('Pizza', 4990)]} page={1} />);
    expect(screen.getByText(`${'a'.repeat(159)}…`)).toBeInTheDocument();
    expect(screen.queryByText(body)).not.toBeInTheDocument();
  });

  it('promoção com preço de sete dígitos usa a fonte menor, igual ao servidor', () => {
    render(<PanelPreview kind="promo" headline={null} body={null} items={[item('Carro', 100000000)]} page={1} />);
    expect(screen.getByText('1.000.000,00').style.fontSize).toBe(`${(75 / 1920) * 100}cqw`);
  });

  it('enquadramento vertical da foto reflete no objectPosition', () => {
    const { container } = render(
      <PanelPreview
        kind="promo"
        headline={null}
        body={null}
        photoOffset={0}
        items={[{ ...item('Pizza', 4990), imageUrl: 'https://example.com/foto.jpg' }]}
        page={1}
      />,
    );
    const photo = container.querySelector('img[alt=""]:not([data-promo-background])');
    expect(photo).toHaveStyle({ objectPosition: '50% 0%' });
  });

  it('enquadramento vertical 100 reflete no objectPosition', () => {
    const { container } = render(
      <PanelPreview
        kind="promo"
        headline={null}
        body={null}
        photoOffset={100}
        items={[{ ...item('Pizza', 4990), imageUrl: 'https://example.com/foto.jpg' }]}
        page={1}
      />,
    );
    const photo = container.querySelector('img[alt=""]:not([data-promo-background])');
    expect(photo).toHaveStyle({ objectPosition: '50% 100%' });
  });

  it('sem photoOffset o objectPosition fica no centro', () => {
    const { container } = render(
      <PanelPreview
        kind="promo"
        headline={null}
        body={null}
        items={[{ ...item('Pizza', 4990), imageUrl: 'https://example.com/foto.jpg' }]}
        page={1}
      />,
    );
    const photo = container.querySelector('img[alt=""]:not([data-promo-background])');
    expect(photo).toHaveStyle({ objectPosition: '50% 50%' });
  });

  it('enquadramento horizontal e vertical combinados refletem no objectPosition', () => {
    const { container } = render(
      <PanelPreview
        kind="promo"
        headline={null}
        body={null}
        photoOffset={75}
        photoOffsetX={25}
        items={[{ ...item('Pizza', 4990), imageUrl: 'https://example.com/foto.jpg' }]}
        page={1}
      />,
    );
    const photo = container.querySelector('img[alt=""]:not([data-promo-background])');
    expect(photo).toHaveStyle({ objectPosition: '25% 75%' });
  });

  it('aviso mostra headline e corpo, sem preço', () => {
    render(<PanelPreview kind="notice" headline="Aceitamos Pix" body="Chave no balcão" items={[]} page={1} />);
    expect(screen.getByText('Aceitamos Pix')).toBeInTheDocument();
    expect(screen.getByText('Chave no balcão')).toBeInTheDocument();
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
  });
});
