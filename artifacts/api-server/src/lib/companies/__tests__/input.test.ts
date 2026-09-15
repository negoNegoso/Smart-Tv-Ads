import { describe, expect, it } from "vitest";
import { createCompanyInput, updateCompanyInput } from "../input";

const base = { name: "Padaria Central", isClient: true, isAdvertiser: false };

describe("createCompanyInput", () => {
  it("exige pelo menos um papel", () => {
    const r = createCompanyInput.safeParse({ ...base, isClient: false });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("Marque cliente e/ou anunciante.");
  });

  it("normaliza CEP, UF e campos vazios", () => {
    const r = createCompanyInput.parse({ ...base, cep: "01310-100", state: "sp", email: "", notes: "  " });
    expect(r).toMatchObject({ cep: "01310100", state: "SP", email: null, notes: null, status: "active" });
  });

  it("recusa CEP incompleto e status desconhecido", () => {
    expect(createCompanyInput.safeParse({ ...base, cep: "0131" }).success).toBe(false);
    expect(createCompanyInput.safeParse({ ...base, status: "inadimplente" }).success).toBe(false);
  });

  it("recusa coordenada fora do globo", () => {
    expect(createCompanyInput.safeParse({ ...base, lat: 91 }).success).toBe(false);
  });
});

describe("updateCompanyInput", () => {
  it("aceita patch parcial sem papéis", () => {
    expect(updateCompanyInput.parse({ status: "paused" })).toEqual({ status: "paused" });
  });

  it("patch de papel não injeta campos de empresa ausentes", () => {
    const r = updateCompanyInput.parse({ isAdvertiser: true, advertiserCompany: "Pão Quente" });
    expect(r).not.toHaveProperty("name");
    expect(r).not.toHaveProperty("email");
    expect(r).not.toHaveProperty("cep");
  });

  it("aceita null explícito para limpar campos opcionais", () => {
    expect(updateCompanyInput.parse({ email: null })).toEqual({ email: null });
    expect(updateCompanyInput.parse({ cep: null })).toEqual({ cep: null });
    expect(updateCompanyInput.parse({ advertiserCompany: null })).toEqual({ advertiserCompany: null });
  });

  it("recusa CEP incompleto com a mesma mensagem do criar", () => {
    const r = updateCompanyInput.safeParse({ cep: "0131" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("CEP deve ter 8 dígitos.");
  });
});
