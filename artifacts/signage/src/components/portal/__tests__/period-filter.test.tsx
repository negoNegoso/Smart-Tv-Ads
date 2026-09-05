import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PeriodFilter } from '../period-filter';

describe('PeriodFilter', () => {
  it('oferece os três presets', () => {
    render(<PeriodFilter value={30} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: '7 dias' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30 dias' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '90 dias' })).toBeInTheDocument();
  });

  it('marca o preset ativo para leitores de tela', () => {
    render(<PeriodFilter value={30} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: '30 dias' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '7 dias' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('emite o preset escolhido', async () => {
    const onChange = vi.fn();
    render(<PeriodFilter value={30} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: '90 dias' }));
    expect(onChange).toHaveBeenCalledWith(90);
  });
});
