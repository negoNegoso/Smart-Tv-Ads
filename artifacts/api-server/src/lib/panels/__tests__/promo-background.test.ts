import { describe, expect, it } from "vitest";
import { promoBackgroundSvg, promoBadgeMetrics, promoBadgeSvg } from "../promo-background";

describe("promoBackgroundSvg", () => {
  it("com foto desenha a diagonal na cor escolhida", () => {
    const svg = promoBackgroundSvg({ color: "#D63A6A", ornament: "#FFFFFF", hasImage: true });
    expect(svg).toContain('<polygon points="0,0 1120,0 960,1080 0,1080" fill="#D63A6A"/>');
    expect(svg).not.toContain("<rect");
  });

  it("sem foto preenche o quadro inteiro", () => {
    const svg = promoBackgroundSvg({ color: "#D63A6A", ornament: "#FFFFFF", hasImage: false });
    expect(svg).toContain('<rect width="1920" height="1080" fill="#D63A6A"/>');
    expect(svg).not.toContain("<polygon");
  });

  it("enfeites usam a cor de enfeite", () => {
    const svg = promoBackgroundSvg({ color: "#FFE600", ornament: "#1F1B2E", hasImage: true });
    expect(svg).toContain('stroke="#1F1B2E"');
    expect(svg).toContain('fill="#1F1B2E"');
  });
});

describe("promoBadgeMetrics", () => {
  it("PROMOÇÃO cabe em fonte grande", () => {
    expect(promoBadgeMetrics("PROMOÇÃO")).toEqual({ fontSize: 96, width: 573, height: 182 });
  });

  it("texto médio reduz a fonte", () => {
    expect(promoBadgeMetrics("OFERTA DA SEMANA").fontSize).toBe(64);
  });

  it("texto longo nunca passa de 800px", () => {
    const m = promoBadgeMetrics("X".repeat(40));
    expect(m.fontSize).toBe(44);
    expect(m.width).toBe(800);
  });
});

describe("promoBadgeSvg", () => {
  it("cápsula pontilhada do tamanho pedido", () => {
    const svg = promoBadgeSvg({ width: 573, height: 182, stroke: "#FFFFFF" });
    expect(svg).toContain('width="573" height="182"');
    expect(svg).toContain('stroke="#FFFFFF"');
    expect(svg).toContain('stroke-dasharray="0 22"');
    expect(svg).toContain('rx="85"');
  });
});
