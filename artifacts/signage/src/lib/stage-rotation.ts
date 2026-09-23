import type { CSSProperties } from 'react';

/**
 * Espelho do `#stage` de `public/tv.html` — mudou lá, mude aqui. A TV retrato
 * é uma TV comum girada na parede: o palco troca largura por altura e gira em
 * torno do centro. As medidas em vh de dentro não mudam (1vh segue sendo 1%
 * do lado curto da tela).
 */
export function stageStyle(orientation: string | undefined): CSSProperties {
  if (orientation !== 'portrait_right' && orientation !== 'portrait_left') {
    return { position: 'absolute', inset: 0 };
  }
  const deg = orientation === 'portrait_right' ? 90 : -90;
  return {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: '100vh',
    height: '100vw',
    transform: `translate(-50%, -50%) rotate(${deg}deg)`,
  };
}
