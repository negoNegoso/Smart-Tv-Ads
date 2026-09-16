import { describe, expect, it } from "vitest";
import { removesLastAdmin } from "../admin-guard";

const admin = { isAdmin: true, isActive: true };

describe("removesLastAdmin", () => {
  it("bloqueia desativar o único admin ativo", () => {
    expect(removesLastAdmin(admin, { isActive: false }, 1)).toBe(true);
  });
  it("bloqueia rebaixar o único admin ativo", () => {
    expect(removesLastAdmin(admin, { isAdmin: false }, 1)).toBe(true);
  });
  it("bloqueia apagar o único admin ativo", () => {
    expect(removesLastAdmin(admin, { deleting: true }, 1)).toBe(true);
  });
  it("libera quando há outro admin ativo", () => {
    expect(removesLastAdmin(admin, { isActive: false }, 2)).toBe(false);
  });
  it("libera mexer em quem não é admin ativo", () => {
    expect(removesLastAdmin({ isAdmin: false, isActive: true }, { deleting: true }, 1)).toBe(false);
    expect(removesLastAdmin({ isAdmin: true, isActive: false }, { deleting: true }, 1)).toBe(false);
  });
  it("libera edição que mantém o admin ativo", () => {
    expect(removesLastAdmin(admin, { isAdmin: true, isActive: true }, 1)).toBe(false);
  });
});
