import { describe, expect, it } from "vitest";
import { MAX_ALERT_BODY, MAX_ALERT_TITLE, alertNode, alertSize } from "../alert-template";

/** Todos os textos da árvore satori, na ordem. */
function texts(tree: unknown): string[] {
  if (typeof tree === "string") return [tree];
  if (!tree || typeof tree !== "object") return [];
  const children = (tree as { props?: { children?: unknown } }).props?.children;
  return Array.isArray(children) ? children.flatMap(texts) : texts(children);
}

/** Nó (com props) cujo filho direto de texto é `text`. */
function nodeWithText(tree: unknown, text: string): { props: { style?: Record<string, unknown> } } | undefined {
  if (!tree || typeof tree !== "object") return undefined;
  const node = tree as { props?: { children?: unknown; style?: Record<string, unknown> } };
  const children = node.props?.children;
  if (children === text) return node as { props: { style?: Record<string, unknown> } };
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = nodeWithText(child, text);
    if (found) return found;
  }
  return undefined;
}

describe("alertSize", () => {
  it("deitado 1920×1080 e em pé 1080×1920", () => {
    expect(alertSize("landscape")).toEqual({ width: 1920, height: 1080 });
    expect(alertSize("portrait")).toEqual({ width: 1080, height: 1920 });
  });
});

describe("alertNode", () => {
  it.each(["landscape", "portrait"] as const)("mostra o selo, o título e o texto (%s)", (orientation) => {
    const out = texts(alertNode({ title: "Hoje fechamos às 18h", body: "Voltamos amanhã às 8h." }, orientation));
    expect(out).toEqual(["AVISO", "Hoje fechamos às 18h", "Voltamos amanhã às 8h."]);
  });

  it("sem texto, só o selo e o título", () => {
    expect(texts(alertNode({ title: "Sistema fora do ar", body: null }, "landscape"))).toEqual(["AVISO", "Sistema fora do ar"]);
  });

  it("corta título e texto nos limites", () => {
    const [, title, body] = texts(alertNode({ title: "t".repeat(80), body: "b".repeat(200) }, "landscape"));
    expect(title).toHaveLength(MAX_ALERT_TITLE);
    expect(title.endsWith("…")).toBe(true);
    expect(body).toHaveLength(MAX_ALERT_BODY);
    expect(body.endsWith("…")).toBe(true);
  });

  it("título e texto quebram palavra longa para não vazar da arte", () => {
    const tree = alertNode({ title: "Titulo", body: "Corpo" }, "landscape");
    expect(nodeWithText(tree, "Titulo")?.props.style?.wordBreak).toBe("break-word");
    expect(nodeWithText(tree, "Corpo")?.props.style?.wordBreak).toBe("break-word");
  });
});
