import { describe, expect, it } from "vitest";
import { paginateMenuItems } from "../paginate";
import {
  MENU_CATEGORY_HEADER_HEIGHT,
  MENU_CONTENT_HEIGHT,
  MENU_ROW_HEIGHT_PLAIN,
  MENU_ROW_HEIGHT_WITH_DESCRIPTION,
} from "../templates";

const item = (name: string, category: string | null, displayOrder: number) => ({
  name,
  description: null as string | null,
  category,
  isActive: true,
  displayOrder,
});

const described = (name: string, category: string | null, displayOrder: number) => ({
  ...item(name, category, displayOrder),
  description: "Descrição que empurra a linha para duas linhas de altura",
});

/** Quantas linhas do tipo cabem numa página com cabeçalho de categoria. */
const capacity = (rowHeight: number) =>
  Math.floor((MENU_CONTENT_HEIGHT - MENU_CATEGORY_HEADER_HEIGHT) / rowHeight);

describe("paginateMenuItems", () => {
  it("painel sem item nenhum não gera página", () => {
    expect(paginateMenuItems([])).toEqual([]);
  });

  it("mantém uma categoria inteira numa página quando cabe", () => {
    const items = [item("Pão", "Padaria", 1), item("Bolo", "Padaria", 2)];
    const pages = paginateMenuItems(items);
    expect(pages).toHaveLength(1);
    expect(pages[0].category).toBe("Padaria");
    expect(pages[0].items.map((i) => i.name)).toEqual(["Pão", "Bolo"]);
  });

  it("categoria nova sempre começa em página nova", () => {
    const items = [item("Pão", "Padaria", 1), item("Café", "Bebidas", 2)];
    const pages = paginateMenuItems(items);
    expect(pages).toHaveLength(2);
    expect(pages.map((p) => p.category)).toEqual(["Padaria", "Bebidas"]);
  });

  it("ignora item inativo", () => {
    const items = [item("Pão", "Padaria", 1), { ...item("Sumiu", "Padaria", 2), isActive: false }];
    expect(paginateMenuItems(items)[0].items.map((i) => i.name)).toEqual(["Pão"]);
  });

  it("respeita displayOrder, não a ordem do array", () => {
    const items = [item("Segundo", "Padaria", 2), item("Primeiro", "Padaria", 1)];
    expect(paginateMenuItems(items)[0].items.map((i) => i.name)).toEqual(["Primeiro", "Segundo"]);
  });

  it("itens sem categoria ficam juntos num grupo sem título", () => {
    const items = [item("Avulso A", null, 1), item("Avulso B", null, 2)];
    const pages = paginateMenuItems(items);
    expect(pages).toHaveLength(1);
    expect(pages[0].category).toBeNull();
  });

  it("a última linha nunca passa do orçamento vertical da página", () => {
    const items = Array.from({ length: 20 }, (_, i) => described(`Item ${i}`, "Lanches", i));
    for (const page of paginateMenuItems(items)) {
      const used =
        MENU_CATEGORY_HEADER_HEIGHT + page.items.length * MENU_ROW_HEIGHT_WITH_DESCRIPTION;
      expect(used).toBeLessThanOrEqual(MENU_CONTENT_HEIGHT);
    }
  });

  it("bug relatado: itens da mesma categoria acima da capacidade viram páginas novas", () => {
    const perPage = capacity(MENU_ROW_HEIGHT_WITH_DESCRIPTION);
    const items = Array.from({ length: perPage + 1 }, (_, i) => described(`Item ${i}`, "Doces", i));
    const pages = paginateMenuItems(items);
    expect(pages).toHaveLength(2);
    expect(pages.every((p) => p.category === "Doces")).toBe(true);
    expect(pages.flatMap((p) => p.items).map((i) => i.name)).toEqual(items.map((i) => i.name));
  });

  it("distribui os itens entre as páginas em vez de deixar a última quase vazia", () => {
    const perPage = capacity(MENU_ROW_HEIGHT_WITH_DESCRIPTION);
    const items = Array.from({ length: perPage + 1 }, (_, i) => described(`Item ${i}`, "Doces", i));
    const sizes = paginateMenuItems(items).map((p) => p.items.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });

  it("linha sem descrição é mais baixa, então cabe mais item na mesma página", () => {
    const semDescricao = capacity(MENU_ROW_HEIGHT_PLAIN);
    const comDescricao = capacity(MENU_ROW_HEIGHT_WITH_DESCRIPTION);
    expect(semDescricao).toBeGreaterThan(comDescricao);
    const items = Array.from({ length: semDescricao }, (_, i) => item(`I${i}`, "Doces", i));
    expect(paginateMenuItems(items)).toHaveLength(1);
  });

  it("mistura de linhas altas e baixas respeita o orçamento em altura, não em contagem", () => {
    const items = [
      ...Array.from({ length: 5 }, (_, i) => described(`Alto ${i}`, "Mix", i)),
      ...Array.from({ length: 5 }, (_, i) => item(`Baixo ${i}`, "Mix", 5 + i)),
    ];
    for (const page of paginateMenuItems(items)) {
      const used =
        MENU_CATEGORY_HEADER_HEIGHT +
        page.items.reduce(
          (sum, i) => sum + (i.description ? MENU_ROW_HEIGHT_WITH_DESCRIPTION : MENU_ROW_HEIGHT_PLAIN),
          0,
        );
      expect(used).toBeLessThanOrEqual(MENU_CONTENT_HEIGHT);
    }
  });

  it("grupo sem categoria ganha de volta a altura do cabeçalho", () => {
    const semCabecalho = Math.floor(MENU_CONTENT_HEIGHT / MENU_ROW_HEIGHT_WITH_DESCRIPTION);
    const items = Array.from({ length: semCabecalho }, (_, i) => described(`I${i}`, null, i));
    expect(paginateMenuItems(items)).toHaveLength(1);
  });

  it("item sozinho maior que o orçamento não trava a paginação", () => {
    const items = Array.from({ length: 3 }, (_, i) => described(`I${i}`, "Doces", i));
    const pages = paginateMenuItems(items, 10);
    expect(pages).toHaveLength(3);
    expect(pages.every((p) => p.items.length === 1)).toBe(true);
  });

  it("orçamento de 0 usa o padrão em vez de travar", () => {
    const items = Array.from({ length: 5 }, (_, i) => item(`I${i}`, "Teste", i));
    expect(paginateMenuItems(items, 0)).toHaveLength(1);
  });

  it("orçamento NaN usa o padrão em vez de retornar []", () => {
    const items = Array.from({ length: 5 }, (_, i) => item(`I${i}`, "Teste", i));
    const pages = paginateMenuItems(items, NaN);
    expect(pages).toHaveLength(1);
    expect(pages[0].items).toHaveLength(5);
  });

  it("numeração de página é contínua entre categorias", () => {
    const items = [item("A", "Um", 1), item("B", "Dois", 2), item("C", "Três", 3)];
    expect(paginateMenuItems(items).map((p) => p.pageNo)).toEqual([1, 2, 3]);
  });
});
