import { useEffect, useState, type RefObject } from 'react';

/**
 * O visitante pode estar vendo o elemento agora? Aba visível e elemento na
 * tela. Exibição que ninguém podia ver não conta no relatório do anunciante.
 *
 * Sem IntersectionObserver (navegador antigo, jsdom), vale "na tela": melhor
 * contar do que parar a TV.
 */
export function useSeen(ref: RefObject<Element | null>): boolean {
  const [tabVisible, setTabVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  const [onScreen, setOnScreen] = useState(true);

  useEffect(() => {
    const onChange = () => setTabVisible(!document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry?.isIntersecting ?? true), { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);

  return tabVisible && onScreen;
}
