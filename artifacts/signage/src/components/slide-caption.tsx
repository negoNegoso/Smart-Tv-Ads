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
 * As medidas acompanham o QR code do slide (base em 3vh, 14vh de altura), e o
 * `leading` igual à altura centraliza o texto sem flexbox. Altura fixa implica
 * uma linha só: texto longo termina em reticências.
 */
export function SlideCaption({ text, slideKey }: { text: string | null; slideKey: number }) {
  if (!text) return null;

  return (
    <div className="absolute bottom-[3vh] left-[3vh] right-[20vh] z-10">
      <AnimatePresence mode="wait">
        <motion.h2
          key={slideKey}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.8 }}
          className="inline-block h-[14vh] max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-[1vh] bg-black/55 px-[3vh] text-[5vh] font-medium leading-[14vh] tracking-tight text-white"
        >
          {text}
        </motion.h2>
      </AnimatePresence>
    </div>
  );
}
