import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { APRESENTACAO } from '@/lib/apresentacao-content';
import { SlideResultado } from '../slides/resultado';

const R = APRESENTACAO.resultado;
const fmt = new Intl.NumberFormat('pt-BR');

describe('SlideResultado', () => {
  it('avisa que os dados são de exemplo', () => {
    render(<SlideResultado />);
    expect(screen.getByText(R.selo)).toBeInTheDocument();
  });

  it('mostra uma linha por peça com exibições e leituras formatadas', () => {
    render(<SlideResultado />);
    const tabela = screen.getByRole('table');
    expect(within(tabela).getAllByRole('row')).toHaveLength(R.pecas.length + 1);
    for (const peca of R.pecas) {
      const linha = within(tabela).getByRole('row', { name: new RegExp(peca.nome) });
      expect(within(linha).getByText(fmt.format(peca.exibicoes))).toBeInTheDocument();
      expect(within(linha).getByText(fmt.format(peca.leituras))).toBeInTheDocument();
    }
  });

  it('a barra da peça com mais exibições ocupa a largura toda', () => {
    const { container } = render(<SlideResultado />);
    const barras = [...container.querySelectorAll<HTMLElement>('[data-barra]')];
    expect(barras).toHaveLength(R.pecas.length);
    expect(barras.map((b) => b.style.width)).toContain('100%');
  });
});
