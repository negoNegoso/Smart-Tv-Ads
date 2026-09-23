/**
 * Orientação da peça e da TV. Fica fora de `schema/` e sem importar o banco
 * para o front (formulário, prévias) e os testes usarem sem DATABASE_URL.
 */
export const ANNOUNCEMENT_ORIENTATIONS = ["landscape", "portrait"] as const;
export type AnnouncementOrientation = (typeof ANNOUNCEMENT_ORIENTATIONS)[number];

/** A TV retrato é uma TV comum girada na parede; o sentido decide o giro do player. */
export const DEVICE_ORIENTATIONS = ["landscape", "portrait_right", "portrait_left"] as const;
export type DeviceOrientation = (typeof DEVICE_ORIENTATIONS)[number];

/**
 * Formato da tela que o público vê. Valor desconhecido vale landscape: uma
 * linha estranha no banco não pode tirar a TV do ar.
 */
export function screenOrientationOf(device: string | null | undefined): AnnouncementOrientation {
  return device === "portrait_right" || device === "portrait_left" ? "portrait" : "landscape";
}

/** Mesma tolerância para a peça. */
export function pieceOrientationOf(piece: string | null | undefined): AnnouncementOrientation {
  return piece === "portrait" ? "portrait" : "landscape";
}

/**
 * Sentido bruto do device (o que /display/feed manda pro player girar), com a
 * mesma tolerância: um valor fora de DEVICE_ORIENTATIONS não pode derrubar o
 * parse do openapi nem tirar a TV do ar, então vale landscape.
 */
export function deviceOrientationOf(raw: string | null | undefined): DeviceOrientation {
  return (DEVICE_ORIENTATIONS as readonly string[]).includes(raw ?? "")
    ? (raw as DeviceOrientation)
    : "landscape";
}

/**
 * Lê o campo vindo do multipart. `undefined` = não enviado (cliente antigo,
 * o POST usa o default e o PATCH não mexe); `null` = enviado inválido (400).
 */
export function parseAnnouncementOrientation(raw: unknown): AnnouncementOrientation | undefined | null {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const value = String(raw);
  return (ANNOUNCEMENT_ORIENTATIONS as readonly string[]).includes(value)
    ? (value as AnnouncementOrientation)
    : null;
}
