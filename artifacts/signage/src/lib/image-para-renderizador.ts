/**
 * Converte formatos que o renderizador do servidor não desenha.
 *
 * O resvg fixado (2.6.2) decodifica PNG, JPEG e GIF — WebP ele **ignora em
 * silêncio**: a saída fica byte a byte igual à de um painel sem imagem, e a
 * promoção iria ao ar com um buraco no lugar da foto. Por isso o servidor
 * recusa WebP no upload.
 *
 * Só que WebP é o que sai de celular e de qualquer exportador web hoje, então
 * recusar sem mais nada empurra o problema para o lojista. O navegador já sabe
 * decodificar WebP nativamente, então a conversão acontece aqui, antes do
 * upload. A alternativa seria mais um decodificador wasm no bundle do servidor
 * — exatamente o tipo de peça que já derrubou a produção duas vezes.
 *
 * O servidor continua recusando WebP, e isso é proposital: esta conversão é
 * conveniência de tela, não a regra. Quem chamar a API direto continua tendo a
 * mesma resposta honesta.
 */

/** Formatos que o renderizador desenha. Espelha lib/image-sniff.ts no servidor. */
const FORMATOS_ACEITOS = new Set(['image/png', 'image/jpeg', 'image/gif']);

/** Acima disto o JPEG entra no lugar do PNG (ver nota em converter). */
const LIMITE_PADRAO_BYTES = 4_000_000;

async function carregarImagem(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Não foi possível ler a imagem escolhida.'));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function paraBlob(canvas: HTMLCanvasElement, tipo: string, qualidade?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, tipo, qualidade));
}

/**
 * Devolve um arquivo que o servidor aceita e o renderizador desenha.
 *
 * Formatos já suportados passam intactos — inclusive o JPEG, que preserva a
 * orientação EXIF do celular; redesenhar num canvas perderia essa informação.
 *
 * A saída preferida é PNG, que não perde qualidade e mantém transparência. Mas
 * foto de celular em PNG facilmente estoura o limite de upload (4 MB na
 * Vercel), então, se o PNG passar do teto, cai para JPEG.
 */
export async function prepararImagemParaUpload(
  file: File,
  limiteBytes: number = LIMITE_PADRAO_BYTES,
): Promise<File> {
  if (FORMATOS_ACEITOS.has(file.type)) return file;

  const img = await carregarImagem(file);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível converter a imagem neste navegador.');
  ctx.drawImage(img, 0, 0);

  const semExtensao = file.name.replace(/\.[^.]+$/, '');

  const png = await paraBlob(canvas, 'image/png');
  if (png && png.size <= limiteBytes) {
    return new File([png], `${semExtensao}.png`, { type: 'image/png' });
  }

  const jpeg = await paraBlob(canvas, 'image/jpeg', 0.9);
  if (!jpeg) throw new Error('Não foi possível converter a imagem neste navegador.');
  return new File([jpeg], `${semExtensao}.jpg`, { type: 'image/jpeg' });
}
