import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Switch } from '../switch';

/**
 * No tema escuro o trilho desligado (--input) é quase o fundo do cartão; se a
 * bolinha também for escura (--background) o interruptor desligado some.
 */
describe('Switch no tema escuro', () => {
  it('bolinha é clara quando desligado e preta sobre o teal quando ligado', () => {
    render(<Switch aria-label="Ativar" />);
    const bolinha = screen.getByRole('switch').firstElementChild!;
    expect(bolinha.className).toContain('bg-foreground');
    expect(bolinha.className).toContain('data-[state=checked]:bg-primary-foreground');
    expect(bolinha.className).not.toMatch(/(?:^|\s)bg-background(?:\s|$)/);
  });
});
