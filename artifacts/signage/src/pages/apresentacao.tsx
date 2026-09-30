import { useEffect, useState, type ComponentType, type MouseEvent } from 'react';
import { List } from 'lucide-react';
import { Indice, type EntradaIndice } from '@/components/apresentacao/indice';
import { SlideCapa } from '@/components/apresentacao/slides/capa';
import { SlideProblema } from '@/components/apresentacao/slides/problema';
import { SlideSolucao } from '@/components/apresentacao/slides/solucao';
import { SlideRede } from '@/components/apresentacao/slides/rede';
import { SlideComoFunciona } from '@/components/apresentacao/slides/como-funciona';
import { SlideDiferenciais } from '@/components/apresentacao/slides/diferenciais';
import { SlideResultado } from '@/components/apresentacao/slides/resultado';
import { SlidePlanoAnunciante } from '@/components/apresentacao/slides/plano-anunciante';
import { SlidePlanoPonto } from '@/components/apresentacao/slides/plano-ponto';
import { SlideFechamento } from '@/components/apresentacao/slides/fechamento';
import { useSlideNav } from '@/hooks/use-slide-nav';
import { APRESENTACAO, type Bloco } from '@/lib/apresentacao-content';

/** Ordem da reunião: tronco comum, depois um bloco por público, e o fecho. */
const SLIDES: Array<{ bloco: Bloco; Slide: ComponentType }> = [
  { bloco: 'comum', Slide: SlideCapa },
  { bloco: 'comum', Slide: SlideProblema },
  { bloco: 'comum', Slide: SlideSolucao },
  { bloco: 'comum', Slide: SlideRede },
  { bloco: 'comum', Slide: SlideComoFunciona },
  { bloco: 'comum', Slide: SlideDiferenciais },
  { bloco: 'anunciante', Slide: SlideResultado },
  { bloco: 'anunciante', Slide: SlidePlanoAnunciante },
  { bloco: 'ponto', Slide: SlidePlanoPonto },
  { bloco: 'fechamento', Slide: SlideFechamento },
];

const ENTRADAS: EntradaIndice[] = (Object.keys(APRESENTACAO.blocos) as Bloco[]).map((bloco) => ({
  bloco,
  label: APRESENTACAO.blocos[bloco],
  primeiro: SLIDES.findIndex((s) => s.bloco === bloco),
}));

// Toque nisto é interação com o slide, não pedido de troca de slide.
const INTERATIVO = 'button, a, input, textarea, select, [data-no-nav]';

/**
 * A apresentação é pública por link, mas não é porta de entrada do site:
 * troca a meta robots do index.html por noindex enquanto está montada.
 */
function useNoIndex() {
  useEffect(() => {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const criada = !meta;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'robots';
      document.head.appendChild(meta);
    }
    const original = meta.content;
    meta.content = 'noindex';
    return () => {
      if (criada) meta.remove();
      else meta.content = original;
    };
  }, []);
}

function alternarTelaCheia() {
  // Safari de iPhone não tem Fullscreen API fora de vídeo: sem ela, nada.
  if (document.fullscreenElement) void document.exitFullscreen?.();
  else void document.documentElement.requestFullscreen?.();
}

export default function Apresentacao() {
  const nav = useSlideNav(SLIDES.length);
  const [indiceAberto, setIndiceAberto] = useState(false);
  useNoIndex();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const tecla = e.key.toLowerCase();
      if (tecla === 'f') alternarTelaCheia();
      else if (tecla === 'i') setIndiceAberto((a) => !a);
      else if (e.key === 'Escape') setIndiceAberto(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function onClickPalco(e: MouseEvent<HTMLDivElement>) {
    if (e.target instanceof Element && e.target.closest(INTERATIVO)) return;
    if (e.clientX < window.innerWidth / 2) nav.voltar();
    else nav.avancar();
  }

  const { Slide } = SLIDES[nav.atual];

  return (
    <div
      data-testid="palco"
      onClick={onClickPalco}
      className="relative h-[100dvh] select-none overflow-hidden bg-background text-foreground"
    >
      {/* Rolável: num celular em pé o slide de plano não cabe inteiro. */}
      <div className="h-full overflow-y-auto">
        <Slide />
      </div>

      <button
        type="button"
        onClick={() => setIndiceAberto((a) => !a)}
        aria-label={APRESENTACAO.navegacao.indice}
        aria-expanded={indiceAberto}
        className="absolute bottom-4 right-4 z-20 rounded-full border border-border bg-card p-2 text-muted-foreground opacity-60 hover:text-foreground hover:opacity-100"
      >
        <List className="h-5 w-5" aria-hidden="true" />
      </button>

      {indiceAberto ? (
        <Indice
          entradas={ENTRADAS}
          atual={nav.atual}
          onEscolher={(n) => {
            nav.ir(n);
            setIndiceAberto(false);
          }}
          onFechar={() => setIndiceAberto(false)}
        />
      ) : null}

      <div
        role="progressbar"
        aria-label={APRESENTACAO.navegacao.progresso}
        aria-valuemin={1}
        aria-valuemax={SLIDES.length}
        aria-valuenow={nav.atual + 1}
        className="absolute inset-x-0 bottom-0 h-1 bg-muted"
      >
        <div
          className="h-full bg-primary transition-[width] duration-300"
          style={{ width: `${((nav.atual + 1) / SLIDES.length) * 100}%` }}
        />
      </div>
    </div>
  );
}
