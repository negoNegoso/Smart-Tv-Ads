import { describe, expect, it } from "vitest";
import { deleteBlock, planRoles } from "../roles";

const none = { devices: 0, panels: 0, campaigns: 0 };
const both = { clientId: 1, advertiserId: 2 };

describe("planRoles", () => {
  it("sem mudança de papel não faz nada", () => {
    expect(planRoles(both, {}, none)).toEqual({
      ok: true,
      plan: { createClient: false, removeClient: false, createAdvertiser: false, removeAdvertiser: false },
    });
  });

  it("ligar anunciante cria o perfil", () => {
    const r = planRoles({ clientId: 1, advertiserId: null }, { isAdvertiser: true }, none);
    expect(r).toMatchObject({ ok: true, plan: { createAdvertiser: true } });
  });

  it("desligar cliente sem TV nem painel remove o perfil", () => {
    expect(planRoles(both, { isClient: false }, none)).toMatchObject({ ok: true, plan: { removeClient: true } });
  });

  it("desligar cliente com TV é 409 com as contagens", () => {
    const deps = { devices: 3, panels: 0, campaigns: 0 };
    expect(planRoles(both, { isClient: false }, deps)).toEqual({
      ok: false, status: 409, error: "Não dá para tirar o papel de cliente: tem 3 TV(s) e 0 painel(éis).", dependencies: deps,
    });
  });

  it("desligar anunciante com campanha é 409", () => {
    const deps = { devices: 0, panels: 0, campaigns: 2 };
    expect(planRoles(both, { isAdvertiser: false }, deps)).toMatchObject({ ok: false, status: 409 });
  });

  it("ficar sem nenhum papel é 400", () => {
    expect(planRoles({ clientId: 1, advertiserId: null }, { isClient: false }, none)).toMatchObject({
      ok: false, status: 400, error: "Marque cliente e/ou anunciante.",
    });
  });
});

describe("deleteBlock", () => {
  it("libera empresa sem dependência", () => {
    expect(deleteBlock(none)).toBeNull();
  });
  it("bloqueia com qualquer dependência", () => {
    expect(deleteBlock({ devices: 1, panels: 2, campaigns: 3 })).toBe(
      "Não dá para excluir: a empresa tem 1 TV(s), 2 painel(éis) e 3 campanha(s).",
    );
  });
});
