import { describe, expect, it } from "vitest";
import { generateScanCode } from "@workspace/db/scan-code";

describe("generateScanCode", () => {
  it("gera 8 caracteres", () => {
    expect(generateScanCode()).toHaveLength(8);
  });

  it("usa apenas o alfabeto base62", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateScanCode()).toMatch(/^[0-9A-Za-z]{8}$/);
    }
  });

  it("não colide em 10.000 gerações", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 10_000; i += 1) {
      codes.add(generateScanCode());
    }
    expect(codes.size).toBe(10_000);
  });
});
