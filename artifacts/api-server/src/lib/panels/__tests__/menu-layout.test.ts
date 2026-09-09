import { describe, expect, it } from "vitest";
import satori from "satori";
import { paginateMenuItems } from "../paginate";
import { panelFonts } from "../assets";
import {
  MENU_CATEGORY_HEADER_HEIGHT,
  MENU_CONTENT_HEIGHT,
  MENU_ROW_HEIGHT_PLAIN,
  MENU_ROW_HEIGHT_WITH_DESCRIPTION,
  panelPageNode,
} from "../templates";
import { PANEL_HEIGHT, PANEL_WIDTH } from "../render";

/**
 * Mede o layout no próprio satori em vez de estimar por fórmula.
 *
 * A versão anterior destas constantes vinha de `fontSize * 1.2`; o teste
 * comparava a estimativa contra ela mesma e passava — enquanto na TV a última
 * linha saía cortada. Aqui quem dá a medida é o satori: ele emite uma máscara
 * `<rect>` por elemento com a caixa exata que desenhou, então mexer em fonte,
 * padding ou gap sem revisar o orçamento quebra o teste.
 */
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function boxes(
  count: number,
  hasDescription: boolean,
  category: string | null,
  canvasHeight: number,
): Promise<Box[]> {
  const items = Array.from({ length: count }, (_, i) => ({
    name: `Item numero ${i + 1}`,
    description: hasDescription ? `Descricao do item ${i + 1}` : null,
    priceCents: 1000 + i,
    oldPriceCents: null,
    imageUrl: null,
  }));
  const svg = await satori(
    panelPageNode({ kind: "menu", headline: null, body: null }, { category, items }) as never,
    { width: PANEL_WIDTH, height: canvasHeight, fonts: await panelFonts() },
  );
  return [...svg.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)"/g)]
    .map((m) => ({ x: +m[1], y: +m[2], width: +m[3], height: +m[4] }))
    // Fora as caixas do quadro inteiro (fundo, clip e máscara da moldura):
    // elas cobrem a tela e não dizem nada sobre o conteúdo.
    .filter((b) => b.width < PANEL_WIDTH);
}

/** A caixa mais alta é o container das linhas (`flex: 1`, come a folga do quadro). */
const rowsContainer = (all: Box[]) =>
  all.reduce((tallest, b) => (b.height > tallest.height ? b : tallest));

/** Tela alta de propósito: mede o layout sem o corte do quadro real. */
const TALL_CANVAS = 4000;

describe("orçamento vertical do menu", () => {
  it("MENU_ROW_HEIGHT_WITH_DESCRIPTION é a altura que o satori dá à linha com descrição", async () => {
    const all = await boxes(4, true, "Bebidas", TALL_CANVAS);
    const rows = all.filter((b) => b.height === MENU_ROW_HEIGHT_WITH_DESCRIPTION);
    expect(rows).toHaveLength(4);
  }, 60_000);

  it("MENU_ROW_HEIGHT_PLAIN é a altura que o satori dá à linha só com nome", async () => {
    const all = await boxes(4, false, "Bebidas", TALL_CANVAS);
    const rows = all.filter((b) => b.height === MENU_ROW_HEIGHT_PLAIN);
    expect(rows).toHaveLength(4);
  }, 60_000);

  it("MENU_CATEGORY_HEADER_HEIGHT é o que o cabeçalho empurra as linhas para baixo", async () => {
    const [comCategoria, semCategoria] = await Promise.all([
      boxes(3, true, "Bebidas", TALL_CANVAS),
      boxes(3, true, null, TALL_CANVAS),
    ]);
    const empurrao = rowsContainer(comCategoria).y - rowsContainer(semCategoria).y;
    expect(empurrao).toBe(MENU_CATEGORY_HEADER_HEIGHT);
  }, 60_000);

  it("MENU_CONTENT_HEIGHT é a altura útil que sobra do padding do frame", async () => {
    const container = rowsContainer(await boxes(3, true, null, PANEL_HEIGHT));
    expect(container.height).toBe(MENU_CONTENT_HEIGHT);
  }, 60_000);

  it("a página cheia que a paginação produz cabe dentro do quadro", async () => {
    // Regressão do bug: 20 itens descritos numa categoria só. Antes a primeira
    // página levava 8 linhas, a oitava caía fora de PANEL_HEIGHT e o
    // `overflow: hidden` do frame a cortava — sem criar a página seguinte.
    const items = Array.from({ length: 20 }, (_, i) => ({
      name: `Item numero ${i + 1}`,
      description: `Descricao do item ${i + 1}`,
      category: "Doces",
      isActive: true,
      displayOrder: i,
    }));
    const [first] = paginateMenuItems(items);
    const all = await boxes(first.items.length, true, first.category, PANEL_HEIGHT);
    const rows = all.filter((b) => b.height === MENU_ROW_HEIGHT_WITH_DESCRIPTION);

    expect(rows).toHaveLength(first.items.length);
    const padding = (PANEL_HEIGHT - MENU_CONTENT_HEIGHT) / 2;
    expect(Math.min(...all.map((b) => b.y))).toBeGreaterThanOrEqual(padding);
    expect(Math.max(...rows.map((b) => b.y + b.height))).toBeLessThanOrEqual(PANEL_HEIGHT - padding);
  }, 60_000);
});
