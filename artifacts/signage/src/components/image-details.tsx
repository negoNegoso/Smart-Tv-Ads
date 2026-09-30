import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { dimensoesDaImagem } from '@/lib/image-para-renderizador';
import {
  PROPORCOES,
  avisosDaImagem,
  descreverProporcao,
  formatarBytes,
  proporcaoMaisProxima,
  type Orientacao,
} from '@/lib/image-details';
import { cn } from '@/lib/utils';

/**
 * Proporção, resolução e avisos da imagem recém-escolhida. Só informa: quem
 * decide a orientação continua sendo o seletor ao lado.
 */
export function ImageDetails({ file, orientation }: { file: File; orientation: Orientacao }) {
  const [dim, setDim] = useState<{ largura: number; altura: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDim(null);
    dimensoesDaImagem(file).then((d) => {
      if (!cancelled) setDim(d);
    });
    return () => {
      cancelled = true;
    };
  }, [file]);

  // Sem medida não há o que dizer; o upload segue do mesmo jeito.
  if (!dim) return null;

  const { largura, altura } = dim;
  const ativa = proporcaoMaisProxima(largura, altura);
  const avisos = avisosDaImagem(largura, altura, orientation);
  const formato = altura > largura ? 'vertical' : largura > altura ? 'horizontal' : 'quadrada';

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-xs font-medium text-muted-foreground">Detalhes da imagem</p>
      <div className="grid grid-cols-5 gap-1">
        {PROPORCOES.map((p) => (
          <div
            key={p.rotulo}
            data-testid={`proporcao-${p.rotulo}`}
            data-ativa={p === ativa}
            className={cn(
              'flex flex-col items-center gap-1 rounded-md py-1.5 text-[11px]',
              p === ativa ? 'bg-primary/15 text-foreground' : 'text-muted-foreground',
            )}
          >
            {/* Retângulo no formato da proporção, dentro de uma caixa de 14px. */}
            <span className="flex h-3.5 w-3.5 items-center justify-center">
              <span
                className="rounded-[2px] border border-current"
                style={
                  p.largura >= p.altura
                    ? { width: '100%', aspectRatio: `${p.largura} / ${p.altura}` }
                    : { height: '100%', aspectRatio: `${p.largura} / ${p.altura}` }
                }
              />
            </span>
            {p.rotulo}
          </div>
        ))}
      </div>
      <p className="text-xs">{descreverProporcao(largura, altura)}</p>
      <p className="text-xs text-muted-foreground">
        {largura} × {altura} px · {formatarBytes(file.size)} · {formato}
      </p>
      {avisos.length > 0 ? (
        <ul aria-label="Avisos da imagem" className="space-y-1">
          {avisos.map((a) => (
            <li key={a} className="flex gap-1.5 text-xs text-amber-400">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              {a}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
