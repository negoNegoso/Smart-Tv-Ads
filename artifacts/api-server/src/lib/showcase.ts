import { screenOrientationOf } from "@workspace/db/orientation";

const LABEL = { landscape: "horizontal", portrait: "vertical" } as const;

/**
 * A landing espelha uma vitrine por formato de tela. Duas vitrines no mesmo
 * formato deixariam a rota pública escolher uma ao acaso, e os números
 * ficariam divididos sem ninguém saber por quê.
 *
 * Compara pela tela que o público vê, não pelo valor bruto: retrato para a
 * direita e para a esquerda são a mesma TV em pé. Por isso a regra fica aqui
 * e não num índice único do banco.
 *
 * Devolve a mensagem do 409, ou null quando pode gravar.
 */
export function showcaseConflictMessage(
  target: { id: number; showcase: boolean; orientation: string },
  others: Array<{ id: number; name: string; orientation: string }>,
): string | null {
  if (!target.showcase) return null;
  const screen = screenOrientationOf(target.orientation);
  const clash = others.find((o) => o.id !== target.id && screenOrientationOf(o.orientation) === screen);
  return clash ? `Já existe uma vitrine ${LABEL[screen]}: ${clash.name}` : null;
}
