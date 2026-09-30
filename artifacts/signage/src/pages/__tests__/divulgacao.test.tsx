import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DIVULGACAO } from '@/lib/divulgacao-content';
import Divulgacao from '../divulgacao';

const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

afterEach(() => {
  if (original) Object.defineProperty(navigator, 'clipboard', original);
  else delete (navigator as { clipboard?: unknown }).clipboard;
});

describe('Divulgacao — apresentação comercial', () => {
  it('abre /apresentacao numa aba nova', () => {
    render(<Divulgacao />);
    const link = screen.getByRole('link', { name: DIVULGACAO.apresentacao.abrir });
    expect(link).toHaveAttribute('href', '/apresentacao');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('copia a URL completa da apresentação', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<Divulgacao />);
    fireEvent.click(screen.getByRole('button', { name: DIVULGACAO.apresentacao.copiarLink }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/apresentacao`));
  });
});
