import { describe, expect, it } from "vitest";
import { canAccessPanel, resolveOwnerClientId } from "../ownership";

const admin = { isAdmin: true, clientIds: [] };
const lojista = { isAdmin: false, clientIds: [7] };
const multi = { isAdmin: false, clientIds: [7, 9] };

describe("canAccessPanel", () => {
  it("admin acessa qualquer painel", () => {
    expect(canAccessPanel(admin, 123)).toBe(true);
  });

  it("cliente acessa o painel do próprio cliente", () => {
    expect(canAccessPanel(lojista, 7)).toBe(true);
  });

  it("cliente não acessa painel de outro cliente", () => {
    expect(canAccessPanel(lojista, 8)).toBe(false);
  });

  it("usuário com dois vínculos acessa os dois", () => {
    expect(canAccessPanel(multi, 9)).toBe(true);
  });
});

describe("resolveOwnerClientId", () => {
  it("cliente com um vínculo não precisa informar o cliente", () => {
    expect(resolveOwnerClientId(lojista, undefined)).toBe(7);
  });

  it("cliente com dois vínculos precisa informar qual", () => {
    expect(resolveOwnerClientId(multi, undefined)).toBeNull();
  });

  it("cliente não cria painel para cliente de fora", () => {
    expect(resolveOwnerClientId(lojista, 8)).toBeNull();
  });

  it("admin precisa informar o cliente explicitamente", () => {
    expect(resolveOwnerClientId(admin, undefined)).toBeNull();
    expect(resolveOwnerClientId(admin, 55)).toBe(55);
  });
});
