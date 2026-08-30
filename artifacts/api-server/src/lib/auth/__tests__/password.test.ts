import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../password";

describe("password (scrypt)", () => {
  it("gera hash no formato scrypt$salt$hash e verifica a senha correta", () => {
    const hash = hashPassword("senha-secreta");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(hash.split("$")).toHaveLength(3);
    expect(verifyPassword("senha-secreta", hash)).toBe(true);
  });

  it("rejeita senha incorreta", () => {
    const hash = hashPassword("senha-secreta");
    expect(verifyPassword("errada", hash)).toBe(false);
  });

  it("gera salts diferentes para a mesma senha", () => {
    expect(hashPassword("x")).not.toBe(hashPassword("x"));
  });

  it("não lança e retorna false para hash malformado", () => {
    expect(verifyPassword("x", "lixo")).toBe(false);
    expect(verifyPassword("x", "scrypt$so-um-campo")).toBe(false);
  });
});
