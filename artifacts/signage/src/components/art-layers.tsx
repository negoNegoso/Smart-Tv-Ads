import { useEffect, useRef, useState } from 'react';
import { precisaDeMoldura } from '@/lib/art-fit';
import { cn } from '@/lib/utils';

/**
 * A arte do jeito que a TV mostra. Espelho das camadas `.slot-fundo` /
 * `.slot-arte` de `public/tv.html` — mudou lá, mude aqui.
 *
 * Ocupa a caixa pai inteira. Mede a arte ao carregar e compara com a própria
 * caixa: fora da proporção (post de feed 4:5 numa TV em pé), a arte vai
 * inteira com a mesma arte desfocada e escurecida atrás; senão, `cover`. Por
 * medir a caixa, serve igual para o player, as prévias e as miniaturas — e o
 * lojista vê na prévia o mesmo enquadramento que vai ao ar.
 *
 * `allowFrame` falso para a capa de reserva do YouTube: tem faixas pretas
 * embutidas, que apareceriam inteiras.
 */
export function ArtLayers({
  url,
  alt,
  allowFrame = true,
}: {
  url: string;
  alt: string;
  allowFrame?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  // Desfoque em px quando há moldura; null = arte em cover.
  const [blurPx, setBlurPx] = useState<number | null>(null);

  useEffect(() => {
    setBlurPx(null);
    if (!allowFrame || !url) return;
    let vivo = true;
    const img = new Image();
    img.onload = () => {
      const box = boxRef.current;
      if (!vivo || !box) return;
      // offsetWidth ignora transform: no palco girado da TV em pé, dá a
      // medida do palco já em pé, que é a que vale.
      const w = box.offsetWidth;
      const h = box.offsetHeight;
      // 4% do lado curto: na TV é o 4vh do tv.html.
      setBlurPx(precisaDeMoldura(img.naturalWidth, img.naturalHeight, w, h) ? Math.min(w, h) * 0.04 : null);
    };
    img.src = url;
    return () => {
      vivo = false;
    };
  }, [url, allowFrame]);

  const framed = blurPx !== null;

  return (
    <div ref={boxRef} className="absolute inset-0 overflow-hidden">
      {framed ? (
        <div
          data-art-fundo
          aria-hidden
          className="absolute inset-0 scale-[1.15] bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${url})`, filter: `blur(${blurPx}px)` }}
        >
          <div className="absolute inset-0 bg-black/45" />
        </div>
      ) : null}
      <img
        src={url}
        alt={alt}
        className={cn('absolute inset-0 h-full w-full', framed ? 'object-contain' : 'object-cover')}
      />
    </div>
  );
}
