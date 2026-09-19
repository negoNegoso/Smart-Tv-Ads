import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "../pg-errors";

/**
 * drizzle-orm 0.45.2 embrulha o erro do pg em `DrizzleQueryError`
 * (`node_modules/drizzle-orm/pg-core/session.js`, `queryWithCache`): o código
 * do pg (`23505`) some de `err.code` e passa a viver em `err.cause.code`. As
 * rotas que tratam violação de unicidade precisam olhar os dois lugares.
 */
describe("isUniqueViolation", () => {
  it("reconhece o código no topo do erro (driver antigo/raw)", () => {
    const err = Object.assign(new Error("duplicate key"), { code: "23505" });
    expect(isUniqueViolation(err)).toBe(true);
  });

  it("reconhece o código em err.cause (DrizzleQueryError do drizzle-orm 0.45.2)", () => {
    const err = Object.assign(new Error("Failed query"), { cause: { code: "23505" } });
    expect(isUniqueViolation(err)).toBe(true);
  });

  it("outro código não é violação de unicidade", () => {
    const err = Object.assign(new Error("not null violation"), { code: "23502" });
    expect(isUniqueViolation(err)).toBe(false);
    const errCause = Object.assign(new Error("Failed query"), { cause: { code: "23502" } });
    expect(isUniqueViolation(errCause)).toBe(false);
  });

  it("valor que não é objeto não quebra", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
    expect(isUniqueViolation(42)).toBe(false);
  });
});
