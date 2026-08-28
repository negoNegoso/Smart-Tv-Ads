import { describe, expect, it } from "vitest";
import { assertRequiredEnv } from "../required-env";

const completo = {
  SCAN_SALT: "sal",
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD: "senha",
  SESSION_SECRET: "segredo",
};

describe("assertRequiredEnv", () => {
  it("aceita ambiente com todas as variáveis obrigatórias", () => {
    expect(() => assertRequiredEnv(completo)).not.toThrow();
  });

  it("rejeita SCAN_SALT ausente", () => {
    const { SCAN_SALT, ...resto } = completo;
    expect(() => assertRequiredEnv(resto)).toThrow(/SCAN_SALT/);
  });

  it("rejeita ADMIN_USERNAME ausente", () => {
    const { ADMIN_USERNAME, ...resto } = completo;
    expect(() => assertRequiredEnv(resto)).toThrow(/ADMIN_USERNAME/);
  });

  it("rejeita ADMIN_PASSWORD ausente", () => {
    const { ADMIN_PASSWORD, ...resto } = completo;
    expect(() => assertRequiredEnv(resto)).toThrow(/ADMIN_PASSWORD/);
  });

  it("rejeita SESSION_SECRET ausente", () => {
    const { SESSION_SECRET, ...resto } = completo;
    expect(() => assertRequiredEnv(resto)).toThrow(/SESSION_SECRET/);
  });

  it("rejeita variável vazia", () => {
    expect(() => assertRequiredEnv({ ...completo, ADMIN_PASSWORD: "" })).toThrow(
      /ADMIN_PASSWORD/,
    );
  });
});
