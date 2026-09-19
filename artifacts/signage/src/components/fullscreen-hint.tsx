import { useEffect, useState } from 'react';

// Nomes antigos da API ainda usados por WebViews de TV box.
type LegacyDocument = Document & {
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
};

type LegacyElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  webkitRequestFullScreen?: () => Promise<void> | void;
  mozRequestFullScreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};

const FULLSCREEN_EVENTS = [
  'fullscreenchange',
  'webkitfullscreenchange',
  'mozfullscreenchange',
  'MSFullscreenChange',
];

function fullscreenActive(): boolean {
  const doc = document as LegacyDocument;
  return !!(
    doc.fullscreenElement ||
    doc.webkitFullscreenElement ||
    doc.mozFullScreenElement ||
    doc.msFullscreenElement
  );
}

function requestFn(): (() => Promise<void> | void) | null {
  if (document.fullscreenEnabled === false) return null;
  const root = document.documentElement as LegacyElement;
  return (
    root.requestFullscreen ||
    root.webkitRequestFullscreen ||
    root.webkitRequestFullScreen ||
    root.mozRequestFullScreen ||
    root.msRequestFullscreen ||
    null
  );
}

/**
 * O navegador só entra em tela cheia depois de um gesto do usuário, então a
 * primeira tecla do controle (ou clique) pede a tela cheia. O aviso some
 * enquanto ela estiver ativa para não cobrir as peças.
 *
 * `public/tv.html` espelha este comportamento em ES5 (#fs-hint) — mudou aqui,
 * mude lá.
 */
export function FullscreenHint() {
  const [visible, setVisible] = useState(() => !!requestFn() && !fullscreenActive());

  useEffect(() => {
    const update = () => setVisible(!!requestFn() && !fullscreenActive());

    const enter = () => {
      if (fullscreenActive()) return;
      const request = requestFn();
      if (!request) return;
      try {
        // Navegador que recusa rejeita a Promise; o player segue igual.
        Promise.resolve(request.call(document.documentElement)).catch(() => {});
      } catch {
        // WebView antigo pode lançar em vez de rejeitar.
      }
    };

    document.addEventListener('keydown', enter);
    document.addEventListener('click', enter);
    FULLSCREEN_EVENTS.forEach((name) => document.addEventListener(name, update));
    return () => {
      document.removeEventListener('keydown', enter);
      document.removeEventListener('click', enter);
      FULLSCREEN_EVENTS.forEach((name) => document.removeEventListener(name, update));
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="absolute right-[3vh] top-[3vh] z-40 rounded-[1vh] bg-black/70 px-[1.6vh] py-[1vh] text-[1.8vh] leading-[2.4vh] text-white">
      Pressione OK para tela cheia
    </div>
  );
}
