/**
 * Espelho de `precisaDeMoldura` em `public/tv.html` — mudou lá, mude aqui.
 *
 * A arte ocupa a tela com `cover`. Quando a proporção dela foge muito da tela
 * (post de feed 4:5 numa TV em pé 9:16, por exemplo), o `cover` corta ~30% das
 * laterais e some com texto e logo da borda. Nesse caso a arte vai inteira
 * (`contain`) com a mesma arte desfocada atrás, para o lojista reaproveitar a
 * arte do Instagram sem refazer.
 *
 * Até 10% de diferença o corte é mínimo e a tela cheia vale mais que a moldura.
 */
const TOLERANCIA = 1.1;

export function precisaDeMoldura(
  larguraArte: number,
  alturaArte: number,
  larguraTela: number,
  alturaTela: number,
): boolean {
  // Medida desconhecida: fica como sempre foi (tela cheia).
  if (!(larguraArte > 0 && alturaArte > 0 && larguraTela > 0 && alturaTela > 0)) return false;
  const arte = larguraArte / alturaArte;
  const tela = larguraTela / alturaTela;
  return Math.max(arte, tela) / Math.min(arte, tela) > TOLERANCIA;
}
