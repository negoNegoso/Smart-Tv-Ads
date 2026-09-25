import { describe, expect, it } from "vitest";
import { paginateFlyer } from "../flyer-paginate";

const items = (n: number, featured: number[] = []) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, isActive: true, displayOrder: i, featured: featured.includes(i + 1) }));
const ids = (list: Array<{ id: number }>) => list.map((i) => i.id);

describe("paginateFlyer", () => {
  it("capa horizontal: 3 destaques + 4 de grade; miolo de 8", () => {
    const pages = paginateFlyer(items(20, [1, 2, 3]), "landscape");
    expect(pages[0]).toMatchObject({ pageNo: 1, isCover: true });
    expect(ids(pages[0]!.featured)).toEqual([1, 2, 3]);
    expect(ids(pages[0]!.grid)).toEqual([4, 5, 6, 7]);
    expect(ids(pages[1]!.grid)).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
    expect(ids(pages[2]!.grid)).toEqual([16, 17, 18, 19, 20]);
    expect(pages).toHaveLength(3);
  });

  it("capa vertical: 3 destaques + 6; miolo de 10", () => {
    const pages = paginateFlyer(items(20, [1, 2, 3]), "portrait");
    expect(ids(pages[0]!.grid)).toEqual([4, 5, 6, 7, 8, 9]);
    expect(pages[1]!.grid).toHaveLength(10);
    expect(ids(pages[2]!.grid)).toEqual([20]);
  });

  it("destaques excedentes voltam para a grade na posição original", () => {
    const pages = paginateFlyer(items(8, [2, 4, 5, 6, 8]), "landscape");
    expect(ids(pages[0]!.featured)).toEqual([2, 4, 5]);
    expect(ids(pages[0]!.grid)).toEqual([1, 3, 6, 7]);
    expect(ids(pages[1]!.grid)).toEqual([8]);
  });

  it("sem destaque a capa é uma grade cheia", () => {
    const pages = paginateFlyer(items(9), "landscape");
    expect(pages[0]!.featured).toEqual([]);
    expect(pages[0]!.grid).toHaveLength(8);
    expect(pages[0]!.isCover).toBe(true);
    expect(ids(pages[1]!.grid)).toEqual([9]);
  });

  it("um item só vira uma página", () => {
    expect(paginateFlyer(items(1, [1]), "portrait")).toHaveLength(1);
  });

  it("ignora inativos e respeita displayOrder", () => {
    const list = [
      { id: 1, isActive: true, displayOrder: 2, featured: false },
      { id: 2, isActive: false, displayOrder: 0, featured: true },
      { id: 3, isActive: true, displayOrder: 1, featured: false },
    ];
    expect(ids(paginateFlyer(list, "landscape")[0]!.grid)).toEqual([3, 1]);
  });

  it("sem itens ativos não há páginas", () => {
    expect(paginateFlyer([], "landscape")).toEqual([]);
  });

  it("60 itens cabem em 8 páginas deitadas e 7 em pé", () => {
    expect(paginateFlyer(items(60, [1, 2, 3]), "landscape")).toHaveLength(8);
    expect(paginateFlyer(items(60, [1, 2, 3]), "portrait")).toHaveLength(7);
  });
});
