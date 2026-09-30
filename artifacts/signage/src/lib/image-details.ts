import { precisaDeMoldura } from '@/lib/art-fit';

/**
 * Detalhes da imagem escolhida no formulário de anúncio: proporção, peso e
 * avisos de como ela vai aparecer na TV. É para o lojista perceber, antes de
 * publicar, que o post do Instagram vai com moldura ou que a foto é pequena
 * demais — em vez de descobrir olhando a TV.
 */

export type Orientacao = 'landscape' | 'portrait';

export type Proporcao = { rotulo: string; largura: number; altura: number };

/** Formatos de referência, na ordem em que aparecem na tela. */
export const PROPORCOES: Proporcao[] = [
  { rotulo: '16:9', largura: 16, altura: 9 },
  { rotulo: '4:3', largura: 4, altura: 3 },
  { rotulo: '1:1', largura: 1, altura: 1 },
  { rotulo: '3:4', largura: 3, altura: 4 },
  { rotulo: '9:16', largura: 9, altura: 16 },
];

/** Até 1% de diferença conta como o formato padrão (1366×768 é 16:9). */
const TOLERANCIA_PADRAO = 0.01;

/** Fração com termos maiores que isto não ajuda ninguém (683:384); vira decimal. */
const MAIOR_TERMO_LEGIVEL = 32;

/** Abaixo disto no lado maior a arte é esticada na TV Full HD e borra. */
const LADO_MINIMO = 1280;

// Distância em log: 2:1 e 1:2 ficam à mesma distância de 1:1, o que a razão
// crua não garante.
function distancia(a: number, b: number): number {
  return Math.abs(Math.log(a / b));
}

export function proporcaoMaisProxima(largura: number, altura: number): Proporcao {
  const razao = largura / altura;
  let melhor = PROPORCOES[0];
  for (const p of PROPORCOES) {
    if (distancia(razao, p.largura / p.altura) < distancia(razao, melhor.largura / melhor.altura)) melhor = p;
  }
  return melhor;
}

function mdc(a: number, b: number): number {
  return b === 0 ? a : mdc(b, a % b);
}

/** Ex.: "16:9", "4:5 (mais próxima: 3:4)", "2,32:1 (mais próxima: 16:9)". */
export function descreverProporcao(largura: number, altura: number): string {
  const proxima = proporcaoMaisProxima(largura, altura);
  if (distancia(largura / altura, proxima.largura / proxima.altura) <= TOLERANCIA_PADRAO) return proxima.rotulo;

  const d = mdc(largura, altura);
  const [l, a] = [largura / d, altura / d];
  const real =
    Math.max(l, a) <= MAIOR_TERMO_LEGIVEL
      ? `${l}:${a}`
      : `${(largura / altura).toFixed(2).replace('.', ',')}:1`;
  return `${real} (mais próxima: ${proxima.rotulo})`;
}

export function formatarBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/** Avisos curtos; lista vazia quando a arte vai aparecer bem. */
export function avisosDaImagem(largura: number, altura: number, orientacao: Orientacao): string[] {
  const vertical = orientacao === 'portrait';
  const [telaL, telaA] = vertical ? [1080, 1920] : [1920, 1080];
  const avisos: string[] = [];
  if (precisaDeMoldura(largura, altura, telaL, telaA)) {
    avisos.push(
      `Na TV ${vertical ? 'vertical' : 'horizontal'} a arte aparece inteira, com fundo desfocado nas sobras.`,
    );
  }
  if (Math.max(largura, altura) < LADO_MINIMO) {
    avisos.push(`Resolução baixa: pode ficar borrada na TV (ideal ${telaL}×${telaA}).`);
  }
  return avisos;
}
