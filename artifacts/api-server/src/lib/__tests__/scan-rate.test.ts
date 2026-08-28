import { describe, expect, it } from "vitest";
import { scanRate } from "../scan-rate";

describe("scanRate", () => {
  it("divide scans por exibições", () => {
    expect(scanRate(5, 1000)).toBeCloseTo(0.005, 10);
  });

  it("retorna 0 quando não há exibições", () => {
    expect(scanRate(3, 0)).toBe(0);
    expect(scanRate(0, 0)).toBe(0);
  });

  it("retorna 0 quando exibições é negativo", () => {
    expect(scanRate(3, -1)).toBe(0);
  });

  it("retorna 0 quando não há scans", () => {
    expect(scanRate(0, 500)).toBe(0);
  });
});
