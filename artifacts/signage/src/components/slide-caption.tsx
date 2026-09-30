import { AnimatePresence, motion } from 'framer-motion';

/**
 * Faixa de texto sobre a imagem do slide.
 *
 * O texto vem pronto da API (`DisplaySlide.displayText`): quando é `null`, o
 * anunciante desligou a exibição ou não preencheu o campo, e nada é renderizado.
 *
 * `artifacts/signage/public/tv.html` espelha estes estilos em ES5 para as Smart
 * TVs — mudou aqui, mude lá.
 *
 * O container sólido dá o contraste: nada de backdrop-blur, sombra ou filtro,
 * que pesam nos navegadores das TVs mais antigas.
 *
 * As medidas acompanham o QR code do slide (base em 3u, 14u de largura), com
 * `u` = `var(--u)`, que o PlayerStage define: 1cqmin (1% do lado curto do
 * palco) onde há container queries, 1vh nos motores antigos das TVs. Na TV em
 * tela cheia os dois são o mesmo 1vh do tv.html; na landing, cqmin escala com
 * a moldura. Só funciona dentro do PlayerStage. O `leading` igual à altura
 * centraliza o texto sem flexbox. Altura fixa implica uma linha só: texto
 * longo termina em reticências.
 */
export function SlideCaption({ text, slideKey }: { text: string | null; slideKey: number }) {
  if (!text) return null;

  return (
    <div className="absolute bottom-[calc(3*var(--u))] left-[calc(3*var(--u))] right-[calc(20*var(--u))] z-10">
      <AnimatePresence mode="wait">
        <motion.h2
          key={slideKey}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.8 }}
          className="inline-block h-[calc(14*var(--u))] max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-[calc(1*var(--u))] bg-black/55 px-[calc(3*var(--u))] text-[length:calc(5*var(--u))] font-medium leading-[calc(14*var(--u))] tracking-tight text-white"
        >
          {text}
        </motion.h2>
      </AnimatePresence>
    </div>
  );
}
