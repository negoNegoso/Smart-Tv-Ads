import { QrCode } from 'lucide-react';
import { LANDING } from '@/lib/landing-content';

/**
 * A TV rodando um slide, desenhada em CSS.
 *
 * Não temos fotografia de ponto instalado, e banco de imagens venderia uma
 * rede que não é a nossa. Isto reproduz o que a tela realmente mostra: arte de
 * fundo, faixa de legenda e a caixa branca do QR com o rótulo SAIBA +, os
 * mesmos elementos de pages/display.tsx.
 */
export function TvMockup() {
  return (
    <div className="w-full max-w-md" aria-hidden="true">
      <div className="rounded-xl border-4 border-zinc-800 bg-zinc-800 shadow-lg">
        <div className="relative aspect-video overflow-hidden rounded-md bg-gradient-to-br from-primary via-indigo-600 to-indigo-900">
          <div className="absolute bottom-3 left-3 right-24 truncate rounded bg-black/55 px-3 py-2 text-sm font-medium text-white">
            {LANDING.mockup.caption}
          </div>
          <div className="absolute bottom-3 right-3 rounded bg-white p-1.5 text-center">
            <span className="block text-[0.6rem] font-semibold tracking-[0.12em] text-black">
              {LANDING.mockup.qrLabel}
            </span>
            <QrCode className="mt-1 h-10 w-10 text-black" />
          </div>
        </div>
      </div>
      <div className="mx-auto h-4 w-24 rounded-b-lg bg-zinc-800" />
    </div>
  );
}
