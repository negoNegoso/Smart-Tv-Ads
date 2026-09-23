/**
 * Formato de uma imagem escolhida no formulário, lido das dimensões reais do
 * arquivo. Quadrada ou ilegível conta como horizontal: é o caso comum, e o
 * operador corrige no seletor.
 */
export function imageOrientation(file: File): Promise<'landscape' | 'portrait'> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img.naturalHeight > img.naturalWidth ? 'portrait' : 'landscape');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve('landscape');
    };
    img.src = url;
  });
}
