import { describe, expect, it } from "vitest";
import { panelPageNode, type RenderItem } from "../templates";

interface SatoriNode {
  type: string;
  props: { children?: unknown; src?: string; style?: Record<string, unknown> };
}

function texts(node: unknown): string[] {
  if (typeof node === "string") return [node];
  if (Array.isArray(node)) return node.flatMap(texts);
  if (node && typeof node === "object" && "props" in node) return texts((node as SatoriNode).props.children);
  return [];
}

function images(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(images);
  if (node && typeof node === "object" && "props" in node) {
    const n = node as SatoriNode;
    return [...(n.type === "img" && n.props.src ? [n.props.src] : []), ...images(n.props.children)];
  }
  return [];
}

function decodedSvgs(node: unknown): string[] {
  return images(node)
    .filter((src) => src.startsWith("data:image/svg+xml;base64,"))
    .map((src) => Buffer.from(src.split(",")[1]!, "base64").toString("utf8"));
}

/** Estilo do primeiro `img` (nó satori) encontrado na árvore. */
function firstImgStyle(node: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = firstImgStyle(child);
      if (found) return found;
    }
    return undefined;
  }
  if (!node || typeof node !== "object" || !("props" in node)) return undefined;
  const n = node as SatoriNode;
  if (n.type === "img" && n.props.src && !n.props.src.startsWith("data:image/svg+xml")) {
    return n.props.style;
  }
  return firstImgStyle(n.props.children);
}

/** Tamanho de fonte do nó cujo texto é exatamente `text`. */
function fontSizeOf(node: unknown, text: string): number | undefined {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = fontSizeOf(child, text);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!("props" in node)) return undefined;
  const n = node as SatoriNode;
  if (n.props.children === text) return n.props.style?.fontSize as number | undefined;
  return fontSizeOf(n.props.children, text);
}

const cheesecake: RenderItem = {
  name: "Cheesecake de morango",
  description: null,
  priceCents: 899,
  oldPriceCents: 1499,
  imageUrl: "data:image/png;base64,AAAA",
};

const page = (item: RenderItem) => ({ category: null, items: [item] });

describe("promoNode", () => {
  it("estilo price mostra DE/POR, preço grande e aviso de imagem ilustrativa", () => {
    const tree = panelPageNode(
      { kind: "promo", headline: null, body: "Só hoje", accentColor: null, promoStyle: null },
      page(cheesecake),
    );
    const t = texts(tree);
    expect(t).toEqual(
      expect.arrayContaining(["PROMOÇÃO", "CHEESECAKE DE MORAN…", "DE", "14,99", "POR", "R$", "8,99", "Só hoje", "*imagens meramente ilustrativas"]),
    );
    expect(t.some((s) => s.includes("%"))).toBe(false);
  });

  it("estilo percent mostra a porcentagem e o DE/POR em uma linha", () => {
    const tree = panelPageNode(
      { kind: "promo", headline: null, body: null, accentColor: null, promoStyle: "percent" },
      page(cheesecake),
    );
    expect(texts(tree)).toEqual(expect.arrayContaining(["40%", "OFF", "DE R$ 14,99 POR R$ 8,99"]));
  });

  it("percent sem preço antigo cai para price", () => {
    const tree = panelPageNode(
      { kind: "promo", headline: null, body: null, accentColor: null, promoStyle: "percent" },
      page({ ...cheesecake, oldPriceCents: null }),
    );
    const t = texts(tree);
    expect(t).toContain("8,99");
    expect(t.some((s) => s.includes("%"))).toBe(false);
    expect(t).not.toContain("DE");
  });

  it.each([
    ["zero", 0],
    ["igual ao preço", 899],
  ])("preço antigo %s não mostra DE/POR", (_caso, oldPriceCents) => {
    const tree = panelPageNode(
      { kind: "promo", headline: null, body: null, accentColor: null, promoStyle: "price" },
      page({ ...cheesecake, oldPriceCents }),
    );
    const t = texts(tree);
    expect(t).toContain("8,99");
    expect(t).not.toContain("DE");
    expect(t).not.toContain("POR");
  });

  // A API aceita até 100.000.000 centavos; "1.000.000,00" em 100px invadiria a foto.
  it.each([
    ["8,99", 899, 150],
    ["1.299,99", 129999, 100],
    ["1.000.000,00", 100000000, 75],
  ])("preço %s usa fonte %s", (amount, priceCents, fontSize) => {
    const tree = panelPageNode(
      { kind: "promo", headline: null, body: null, accentColor: null, promoStyle: null },
      page({ ...cheesecake, priceCents, oldPriceCents: null }),
    );
    expect(fontSizeOf(tree, amount as string)).toBe(fontSize);
  });

  it("usa a cor escolhida no fundo e desenha a diagonal com foto", () => {
    const tree = panelPageNode(
      { kind: "promo", headline: "Oferta", body: null, accentColor: "#2563eb", promoStyle: null },
      page(cheesecake),
    );
    const svgs = decodedSvgs(tree);
    expect(svgs.some((s) => s.includes('<polygon') && s.includes('fill="#2563EB"'))).toBe(true);
    expect(images(tree)).toContain(cheesecake.imageUrl);
  });

  it("sem foto: retângulo cheio e sem aviso de imagem ilustrativa", () => {
    const tree = panelPageNode(
      { kind: "promo", headline: null, body: null, accentColor: null, promoStyle: null },
      page({ ...cheesecake, imageUrl: null }),
    );
    expect(decodedSvgs(tree).some((s) => s.includes('<rect width="1920" height="1080"'))).toBe(true);
    expect(texts(tree)).not.toContain("*imagens meramente ilustrativas");
  });

  it.each([
    [0, "50% 0%"],
    [100, "50% 100%"],
  ])("photoOffset %s vira objectPosition %s", (photoOffset, objectPosition) => {
    const tree = panelPageNode(
      { kind: "promo", headline: null, body: null, accentColor: null, promoStyle: null, photoOffset },
      page(cheesecake),
    );
    expect(firstImgStyle(tree)?.objectPosition).toBe(objectPosition);
  });

  it("photoOffset nulo centraliza a foto (50%)", () => {
    const tree = panelPageNode(
      { kind: "promo", headline: null, body: null, accentColor: null, promoStyle: null, photoOffset: null },
      page(cheesecake),
    );
    expect(firstImgStyle(tree)?.objectPosition).toBe("50% 50%");
  });
});
