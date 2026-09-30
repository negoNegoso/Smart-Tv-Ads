import { render, screen, waitFor } from '@testing-library/react';
import QRCode from 'qrcode';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APRESENTACAO } from '@/lib/apresentacao-content';
import { whatsappUrl } from '@/lib/landing-content';
import { SlideFechamento } from '../slides/fechamento';

const F = APRESENTACAO.fechamento;

afterEach(() => vi.restoreAllMocks());

describe('SlideFechamento', () => {
  it('link abre o WhatsApp com a mensagem da apresentação', () => {
    render(<SlideFechamento />);
    const link = screen.getByRole('link', { name: F.linkLabel });
    expect(link).toHaveAttribute('href', whatsappUrl('Olá! Vi a apresentação da Smart Vale TV.'));
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('gera o QR em SVG com o mesmo link', async () => {
    const spy = vi.spyOn(QRCode, 'toString');
    render(<SlideFechamento />);
    const qr = await screen.findByRole('img', { name: F.qrLabel });
    await waitFor(() => expect(qr.querySelector('svg')).not.toBeNull());
    expect(spy).toHaveBeenCalledWith(whatsappUrl(F.message), expect.objectContaining({ type: 'svg' }));
  });

  it('se o QR falhar, o link continua lá', async () => {
    vi.spyOn(QRCode, 'toString').mockImplementation((() =>
      Promise.reject(new Error('falhou'))) as unknown as typeof QRCode.toString);
    render(<SlideFechamento />);
    await waitFor(() => expect(screen.queryByRole('img', { name: F.qrLabel })).toBeNull());
    expect(screen.getByRole('link', { name: F.linkLabel })).toBeInTheDocument();
  });
});
