import { describe, expect, it, vi } from "vitest";

// device-slides.ts importa @workspace/db no topo (para panelSlidesForClient);
// este arquivo só exercita composeDeviceSlides, que é puro. Mockar o módulo
// evita exigir DATABASE_URL para importar.
vi.mock("@workspace/db", () => ({
  db: {},
  panelsTable: {},
  panelSlidesTable: {},
  announcementsTable: {},
}));

const { composeDeviceSlides } = await import("../device-slides");

const slide = (announcementId: number, label: string) => ({ announcementId, label });

describe("composeDeviceSlides", () => {
  it("campanhas vêm antes do conteúdo do lojista", () => {
    const out = composeDeviceSlides([slide(1, "campanha")], [slide(2, "painel")], [slide(3, "playlist")]);
    expect(out.map((s) => s.label)).toEqual(["campanha", "painel", "playlist"]);
  });

  it("mesma peça em duas fontes aparece uma vez, na primeira", () => {
    const out = composeDeviceSlides([slide(1, "campanha")], [slide(1, "painel")], []);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("campanha");
  });

  it("painel duplicado na playlist do device não repete", () => {
    const out = composeDeviceSlides([], [slide(4, "painel")], [slide(4, "playlist")]);
    expect(out.map((s) => s.label)).toEqual(["painel"]);
  });

  it("sem painel publicado o resultado é o de antes", () => {
    const out = composeDeviceSlides([slide(1, "c")], [], [slide(2, "p")]);
    expect(out.map((s) => s.announcementId)).toEqual([1, 2]);
  });

  it("preserva a ordem de cada fonte", () => {
    const out = composeDeviceSlides([], [slide(1, "p1"), slide(2, "p2")], []);
    expect(out.map((s) => s.announcementId)).toEqual([1, 2]);
  });
});
