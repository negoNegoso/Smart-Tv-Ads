import { describe, expect, it } from "vitest";
import { SYSTEM_SOURCES, isSystemSource } from "../system-sources";

describe("isSystemSource", () => {
  it("aviso urgente e conteúdo editorial são peças de sistema", () => {
    expect(SYSTEM_SOURCES).toEqual(["alert", "editorial"]);
    expect(isSystemSource("alert")).toBe(true);
    expect(isSystemSource("editorial")).toBe(true);
  });

  it("peça do admin, de painel ou sem fonte não é", () => {
    expect(isSystemSource("admin")).toBe(false);
    expect(isSystemSource("panel")).toBe(false);
    expect(isSystemSource(null)).toBe(false);
    expect(isSystemSource(undefined)).toBe(false);
  });
});
