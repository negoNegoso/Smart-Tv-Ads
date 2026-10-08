/**
 * Faixa de recados no rodapé do palco. Espelho do #ticker de public/tv.html —
 * mudou lá, mude aqui: mesma altura (8vh), cores e regra de velocidade.
 */
export function tickerDurationSeconds(text: string): number {
  return Math.max(12, Math.ceil(text.length * 0.25));
}

export function TickerBar({ text }: { text: string }) {
  return (
    <div
      data-testid="ticker"
      className="absolute inset-x-0 bottom-0 z-40 h-[8vh] overflow-hidden whitespace-nowrap bg-[#111] text-[4.5vh] leading-[8vh] text-white"
    >
      {/* key: texto novo recomeça a animação do início, como no tv.html. */}
      <div
        key={text}
        className="inline-block pl-[100%]"
        style={{ animation: `ticker-correr ${tickerDurationSeconds(text)}s linear infinite` }}
      >
        {text}
      </div>
    </div>
  );
}
