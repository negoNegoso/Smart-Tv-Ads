import { describe, expect, it } from "vitest";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
  createSession,
  verifySession,
} from "../session";

const SECRET = "segredo-de-teste";
const NOW = 1_700_000_000_000;

describe("sessão assinada", () => {
  it("expõe o nome do cookie e a validade de 7 dias", () => {
    expect(SESSION_COOKIE).toBe("sid");
    expect(SESSION_MAX_AGE_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("verifica um token recém-criado", () => {
    const token = createSession(SECRET, NOW);
    expect(verifySession(token, SECRET, NOW)).toBe(true);
  });

  it("rejeita token com assinatura adulterada", () => {
    const token = createSession(SECRET, NOW);
    const adulterado = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    expect(verifySession(adulterado, SECRET, NOW)).toBe(false);
  });

  it("rejeita token expirado", () => {
    const token = createSession(SECRET, NOW);
    const depois = NOW + SESSION_MAX_AGE_MS + 1;
    expect(verifySession(token, SECRET, depois)).toBe(false);
  });

  it("rejeita token assinado com outro segredo", () => {
    const token = createSession("outro-segredo", NOW);
    expect(verifySession(token, SECRET, NOW)).toBe(false);
  });

  it("rejeita token ausente ou malformado sem lançar", () => {
    expect(verifySession(undefined, SECRET, NOW)).toBe(false);
    expect(verifySession("", SECRET, NOW)).toBe(false);
    expect(verifySession("semponto", SECRET, NOW)).toBe(false);
    expect(verifySession("abc.def", SECRET, NOW)).toBe(false);
  });
});
