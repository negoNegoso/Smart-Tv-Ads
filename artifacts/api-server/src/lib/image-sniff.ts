/**
 * Sniffa o tipo real de uma imagem pelos bytes mágicos, em vez de confiar no
 * mimetype declarado pelo cliente (Content-Type de um multipart ou de um
 * fetch são texto livre que o remetente escolhe e podem mentir). Usado tanto
 * para resolver a foto de uma promoção já armazenada (`promo-image.ts`, sem
 * content-type nenhum vindo do MediaStore) quanto para validar um upload
 * novo antes de gravá-lo (rota de painéis): um arquivo cujos bytes não batem
 * com nenhuma assinatura conhecida não é uma imagem, mesmo que o cliente
 * tenha dito que era.
 */
const IMAGE_MAGIC_BYTES: Array<{ mimeType: string; test: (b: Buffer) => boolean }> = [
  {
    mimeType: "image/png",
    test: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  { mimeType: "image/jpeg", test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mimeType: "image/gif", test: (b) => b.length >= 6 && /^GIF8[79]a$/.test(b.subarray(0, 6).toString("latin1")) },
  {
    mimeType: "image/webp",
    test: (b) =>
      b.length >= 12 &&
      b.subarray(0, 4).toString("latin1") === "RIFF" &&
      b.subarray(8, 12).toString("latin1") === "WEBP",
  },
];

/** Sniffa o tipo pelos bytes mágicos. Devolve `null` quando nenhuma assinatura bate. */
export function sniffImageMimeType(buffer: Buffer): string | null {
  return IMAGE_MAGIC_BYTES.find((format) => format.test(buffer))?.mimeType ?? null;
}
