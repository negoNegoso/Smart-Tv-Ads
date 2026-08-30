import { describe, expect, it } from "vitest";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
  createSession,
  verifySession,
  sessionSubject,
} from "../session";

const SECRET = "segredo-de-teste";
const NOW = 1_700_000_000_000;

describe("sessão assinada", () => {
  it("expõe o nome do cookie e a validade de 7 dias", () => {
    expect(SESSION_COOKIE).toBe("sid");
    expect(SESSION_MAX_AGE_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("verifica um token recém-criado", () => {
    const token = createSession(SECRET, "admin", NOW);
    expect(verifySession(token, SECRET, NOW)).toBe(true);
  });

  it("rejeita token com assinatura adulterada", () => {
    const token = createSession(SECRET, "admin", NOW);
    const adulterado = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    expect(verifySession(adulterado, SECRET, NOW)).toBe(false);
  });

  it("rejeita token expirado", () => {
    const token = createSession(SECRET, "admin", NOW);
    const depois = NOW + SESSION_MAX_AGE_MS + 1;
    expect(verifySession(token, SECRET, depois)).toBe(false);
  });

  it("rejeita token assinado com outro segredo", () => {
    const token = createSession("outro-segredo", "admin", NOW);
    expect(verifySession(token, SECRET, NOW)).toBe(false);
  });

  it("rejeita token ausente ou malformado sem lançar", () => {
    expect(verifySession(undefined, SECRET, NOW)).toBe(false);
    expect(verifySession("", SECRET, NOW)).toBe(false);
    expect(verifySession("semponto", SECRET, NOW)).toBe(false);
    expect(verifySession("abc.def", SECRET, NOW)).toBe(false);
  });
});

describe("subject na sessão", () => {
  const SECRET = "segredo-de-teste";
  const NOW = 1_700_000_000_000;

  it("token de admin: subject === 'admin'", () => {
    const token = createSession(SECRET, "admin", NOW);
    expect(verifySession(token, SECRET, NOW)).toBe(true);
    expect(sessionSubject(token, SECRET, NOW)).toBe("admin");
  });

  it("token de usuário: subject === userId (string numérica)", () => {
    const token = createSession(SECRET, "42", NOW);
    expect(sessionSubject(token, SECRET, NOW)).toBe("42");
  });

  it("subject inválido/ausente retorna null", () => {
    expect(sessionSubject("lixo", SECRET, NOW)).toBeNull();
    const outro = createSession("outro", "admin", NOW);
    expect(sessionSubject(outro, SECRET, NOW)).toBeNull();
  });

  it("mantém compatibilidade: createSession sem subject assume 'admin'", () => {
    const token = createSession(SECRET, undefined, NOW);
    expect(sessionSubject(token, SECRET, NOW)).toBe("admin");
  });
});
