import { describe, expect, it } from "vitest";
import { iconFor, iconSvg, weatherIcon, type IconKind } from "../weather-icons";

const KINDS: IconKind[] = ["sun", "partly", "cloud", "fog", "rain", "storm", "snow"];

describe("iconFor", () => {
  it.each([
    [0, "sun"],
    [1, "partly"],
    [2, "partly"],
    [3, "cloud"],
    [45, "fog"],
    [48, "fog"],
    [51, "rain"],
    [57, "rain"],
    [61, "rain"],
    [67, "rain"],
    [80, "rain"],
    [82, "storm"],
    [95, "storm"],
    [99, "storm"],
    [71, "snow"],
    [86, "snow"],
  ] as const)("código %i vira %s", (code, kind) => {
    expect(iconFor(code)).toBe(kind);
  });

  it("código desconhecido vira nuvem, como o 'Tempo instável' do rótulo", () => {
    expect(iconFor(1234)).toBe("cloud");
  });
});

describe("iconSvg", () => {
  it.each(KINDS)("%s é um SVG fechado com viewBox", (kind) => {
    const svg = iconSvg(kind);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('viewBox="0 0 100 100"');
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });
});

describe("weatherIcon", () => {
  it("vira img do satori com o SVG em data URI no tamanho pedido", () => {
    const node = weatherIcon(0, 120) as { type: string; props: { src: string; width: number; height: number } };
    expect(node.type).toBe("img");
    expect(node.props.width).toBe(120);
    expect(node.props.height).toBe(120);
    expect(node.props.src.startsWith("data:image/svg+xml;base64,")).toBe(true);
    const svg = Buffer.from(node.props.src.split(",")[1], "base64").toString("utf8");
    expect(svg).toBe(iconSvg("sun"));
  });
});
