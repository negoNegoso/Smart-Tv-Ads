import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MapaVale } from '../mapa-vale';

const REGISTRO = '3542602';
const MIRACATU = '3529906';

function path(container: HTMLElement, ibge: string) {
  const el = container.querySelector(`path[data-ibge="${ibge}"]`);
  if (!el) throw new Error(`path ${ibge} não encontrado`);
  return el as SVGPathElement;
}

describe('MapaVale', () => {
  it('desenha os 24 municípios do Vale', () => {
    const { container } = render(<MapaVale parceiras={new Set()} />);
    expect(container.querySelectorAll('path[data-ibge]')).toHaveLength(24);
  });

  it('pinta a ativa, as parceiras e o resto com cores diferentes', () => {
    const { container } = render(
      <MapaVale parceiras={new Set([REGISTRO, MIRACATU])} ativa={REGISTRO} />,
    );
    expect(path(container, REGISTRO).getAttribute('fill')).toBe('hsl(var(--primary))');
    expect(path(container, MIRACATU).getAttribute('fill')).toBe('hsl(var(--primary) / 0.35)');
    expect(path(container, '3553500').getAttribute('fill')).toBe('hsl(var(--muted-foreground) / 0.3)');
  });

  it('só chama onSelecionar ao clicar em cidade parceira', () => {
    const onSelecionar = vi.fn();
    const { container } = render(
      <MapaVale parceiras={new Set([REGISTRO])} onSelecionar={onSelecionar} />,
    );
    fireEvent.click(path(container, '3553500'));
    expect(onSelecionar).not.toHaveBeenCalled();
    fireEvent.click(path(container, REGISTRO));
    expect(onSelecionar).toHaveBeenCalledWith(REGISTRO);
  });

  it('sem onSelecionar nenhuma cidade recebe ponteiro', () => {
    const { container } = render(<MapaVale parceiras={new Set([REGISTRO])} />);
    expect(path(container, REGISTRO).style.pointerEvents).toBe('none');
  });
});
