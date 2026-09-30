import { useCallback, useEffect, useState } from 'react';

/**
 * Hash 1-based (`#1`…`#N`) para índice 0-based. Qualquer coisa fora disso
 * abre o primeiro slide: link colado errado não pode deixar a tela vazia na
 * frente do cliente.
 */
export function lerSlideDoHash(hash: string, total: number): number {
  const texto = hash.replace(/^#/, '');
  if (!/^\d+$/.test(texto)) return 0;
  const n = Number(texto);
  return n >= 1 && n <= total ? n - 1 : 0;
}

export interface SlideNav {
  atual: number;
  total: number;
  ir(n: number): void;
  avancar(): void;
  voltar(): void;
}

// PageUp/PageDown são o que os passadores de slide de bolso mandam.
const AVANCAR = new Set(['ArrowRight', ' ', 'PageDown']);
const VOLTAR = new Set(['ArrowLeft', 'PageUp']);

export function useSlideNav(total: number): SlideNav {
  const [atual, setAtual] = useState(() => lerSlideDoHash(window.location.hash, total));

  const ir = useCallback(
    (n: number) => setAtual(Math.min(Math.max(n, 0), total - 1)),
    [total],
  );
  const avancar = useCallback(() => setAtual((a) => Math.min(a + 1, total - 1)), [total]);
  const voltar = useCallback(() => setAtual((a) => Math.max(a - 1, 0)), []);

  // replaceState, não pushState: o "voltar" do navegador sai da
  // apresentação, em vez de desfazer slide a slide. O hash só existe para
  // um recarregamento no meio da reunião voltar ao mesmo slide.
  useEffect(() => {
    window.history.replaceState(window.history.state, '', `#${atual + 1}`);
  }, [atual]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      // Espaço num botão focado é clique nele (ex.: girar a TV do mockup).
      const alvo = e.target instanceof Element ? e.target : null;
      if (e.key === ' ' && alvo?.closest('button, a, input, textarea, select')) return;
      if (AVANCAR.has(e.key)) {
        e.preventDefault();
        avancar();
      } else if (VOLTAR.has(e.key)) {
        e.preventDefault();
        voltar();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [avancar, voltar]);

  return { atual, total, ir, avancar, voltar };
}
