import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageHeader } from '../page-header';

const TRAIL = [
  { label: 'Empresas', href: '/companies' },
  { label: 'Padaria Central', href: '/companies/5' },
  { label: 'Campanha de Natal' },
];

describe('PageHeader', () => {
  it('desenha o caminho com links até a página atual', () => {
    render(<PageHeader trail={TRAIL} />);
    const caminho = screen.getByRole('navigation', { name: 'breadcrumb' });
    expect(caminho).toHaveClass('hidden', 'md:block');
    const links = Array.from(caminho.querySelectorAll('a')).map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([
      ['Empresas', '/companies'],
      ['Padaria Central', '/companies/5'],
    ]);
    // O último item é onde o usuário está: texto, não link.
    expect(caminho).toHaveTextContent('Campanha de Natal');
    expect(screen.getByText('Campanha de Natal').closest('a')).toBeNull();
  });

  it('no celular mostra só o voltar para o item anterior', () => {
    render(<PageHeader trail={TRAIL} />);
    const voltar = screen.getByTestId('page-header-voltar');
    expect(voltar).toHaveClass('md:hidden');
    expect(voltar).toHaveAttribute('href', '/companies/5');
    expect(voltar).toHaveTextContent('Padaria Central');
  });

  it('sem item anterior com link não mostra voltar', () => {
    render(<PageHeader trail={[{ label: 'Sozinha' }]} />);
    expect(screen.queryByTestId('page-header-voltar')).toBeNull();
  });
});
