import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { APRESENTACAO } from '@/lib/apresentacao-content';
import { whatsappUrl } from '@/lib/landing-content';
import { SlideShell } from '../slide-shell';

const URL_WHATSAPP = whatsappUrl(APRESENTACAO.fechamento.message);

/**
 * Fecha a reunião num QR que abre o WhatsApp. A mensagem é própria da
 * apresentação: o contato chega dizendo de onde veio.
 *
 * Preto e branco fixos no QR (não tokens de tema): câmera lê QR escuro
 * sobre claro; invertido no tema escuro, muito leitor falha.
 */
export function SlideFechamento() {
  const { titulo, corpo, qrLabel, linkLabel } = APRESENTACAO.fechamento;
  // undefined = gerando; null = falhou (fica só o link).
  const [svg, setSvg] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let vivo = true;
    // Sem `color`: o padrão do qrcode já é preto sobre branco.
    QRCode.toString(URL_WHATSAPP, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      .then((s) => vivo && setSvg(s))
      .catch(() => vivo && setSvg(null));
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <SlideShell titulo={titulo}>
      <div className="flex flex-col items-center gap-8 text-center md:flex-row md:text-left">
        {svg !== null ? (
          <div
            role="img"
            aria-label={qrLabel}
            className="h-56 w-56 shrink-0 rounded-xl bg-foreground p-3 sm:h-72 sm:w-72 [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
          />
        ) : null}
        <div>
          <p className="text-xl leading-relaxed text-muted-foreground sm:text-2xl">{corpo}</p>
          <a
            href={URL_WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-lg font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            {linkLabel}
          </a>
        </div>
      </div>
    </SlideShell>
  );
}
