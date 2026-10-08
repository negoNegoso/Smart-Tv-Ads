import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TickerBar, tickerDurationSeconds } from '../ticker-bar';

describe('tickerDurationSeconds', () => {
  it('mesma regra do tv.html: 0,25s por caractere, mínimo 12s', () => {
    expect(tickerDurationSeconds('Curto')).toBe(12);
    expect(tickerDurationSeconds('x'.repeat(200))).toBe(50);
  });
});

describe('TickerBar', () => {
  it('mostra o texto correndo com a duração da regra', () => {
    render(<TickerBar text="Pão quentinho às 17h" />);
    const texto = screen.getByText('Pão quentinho às 17h');
    expect(texto.style.animation).toContain('ticker-correr');
    expect(texto.style.animation).toContain('12s');
    expect(screen.getByTestId('ticker')).toBeInTheDocument();
  });
});
