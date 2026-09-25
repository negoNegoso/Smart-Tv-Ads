import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Logo } from '../logo';
import * as P from '../logo-paths';

const MESTRE = readFileSync(resolve(import.meta.dirname, '../../../../../../brand/logo.svg'), 'utf8');

describe('Logo', () => {
  it('versão completa tem nome acessível e as cinco partes', () => {
    render(<Logo />);
    const svg = screen.getByRole('img', { name: 'Smart Vale TV' });
    expect(svg.getAttribute('viewBox')).toBe(P.LOGO_VIEWBOX);
    expect(svg.querySelectorAll('path')).toHaveLength(5);
  });

  it('"smart" e "tv" seguem a cor do texto; "vale" e ícone usam o primary', () => {
    const { container } = render(<Logo />);
    const fills = Array.from(container.querySelectorAll('path')).map((p) => p.getAttribute('fill'));
    // Assim o mesmo componente sai branco na tela e preto no papel.
    expect(fills).toEqual([
      'currentColor',
      'hsl(var(--primary))',
      'currentColor',
      'hsl(var(--primary))',
      'hsl(var(--primary))',
    ]);
  });

  it('versão ícone só desenha tela e play', () => {
    render(<Logo variant="mark" />);
    const svg = screen.getByRole('img', { name: 'Smart Vale TV' });
    expect(svg.getAttribute('viewBox')).toBe(P.MARK_VIEWBOX);
    expect(svg.querySelectorAll('path')).toHaveLength(2);
  });

  it('className soma à classe padrão', () => {
    render(<Logo className="h-12" />);
    expect(screen.getByRole('img').getAttribute('class')).toContain('h-12');
  });

  it('paths iguais aos do mestre brand/logo.svg', () => {
    for (const d of [P.PATH_SMART, P.PATH_VALE, P.PATH_TV, P.PATH_TELA, P.PATH_PLAY]) {
      expect(MESTRE).toContain(`d="${d}"`);
    }
    expect(MESTRE).toContain(`viewBox="${P.LOGO_VIEWBOX}"`);
  });
});
