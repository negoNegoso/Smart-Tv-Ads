import { describe, expect, it } from "vitest";
import { MENU_ITEMS_PER_PAGE, paginateMenuItems } from "../paginate";

const item = (name: string, category: string | null, displayOrder: number) => ({
  name,
  category,
  isActive: true,
  displayOrder,
});

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

  it("quebra a categoria que estoura em páginas da mesma categoria", () => {
    const items = Array.from({ length: 10 }, (_, i) => item(`Item ${i}`, "Lanches", i));
    const pages = paginateMenuItems(items, 4);
    expect(pages.map((p) => p.items.length)).toEqual([4, 4, 2]);
    expect(pages.every((p) => p.category === "Lanches")).toBe(true);
    expect(pages.map((p) => p.pageNo)).toEqual([1, 2, 3]);
  });

  it("categoria nova sempre começa em página nova", () => {
    const items = [item("Pão", "Padaria", 1), item("Café", "Bebidas", 2)];
    const pages = paginateMenuItems(items);
    expect(pages).toHaveLength(2);
    expect(pages.map((p) => p.category)).toEqual(["Padaria", "Bebidas"]);
  });

  it("exatamente perPage itens ocupam uma página só", () => {
    const items = Array.from({ length: MENU_ITEMS_PER_PAGE }, (_, i) => item(`I${i}`, "Doces", i));
    expect(paginateMenuItems(items)).toHaveLength(1);
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
});
