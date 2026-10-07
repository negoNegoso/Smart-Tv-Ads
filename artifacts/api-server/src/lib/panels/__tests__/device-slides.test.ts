import { afterAll, describe, expect, it } from "vitest";

// device-slides.ts importa @workspace/db no topo. composeDeviceLoop é
// pura e não precisa de banco; buildPanelSlidesQuery precisa do query
// builder de verdade (para inspecionar o SQL gerado via .toSQL()), então
// aqui só garantimos um DATABASE_URL fictício antes de importar — o Pool do
// `pg` só conecta na primeira query executada, e `.toSQL()` nunca executa
// nada.
//
// O Vitest reaproveita workers entre arquivos de teste: mutar a env global
// sem desfazer vazaria esse DATABASE_URL fictício para outro arquivo que
// rode no mesmo worker depois deste, tornando-o dependente de ordem.
const previousDatabaseUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";

afterAll(() => {
  if (previousDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = previousDatabaseUrl;
  }
});

const { composeDeviceLoop, buildPanelSlidesQuery } = await import("../device-slides");

const slide = (announcementId: number, label: string) => ({ announcementId, label });

describe("composeDeviceLoop", () => {
  it("campanhas vêm antes do conteúdo do lojista", () => {
    const out = composeDeviceLoop([slide(1, "campanha")], [slide(2, "painel")], [slide(3, "playlist")]);
    expect(out.map((s) => s.label)).toEqual(["campanha", "painel", "playlist"]);
  });

  it("mesma peça em duas fontes aparece uma vez, na primeira", () => {
    const out = composeDeviceLoop([slide(1, "campanha")], [slide(1, "painel")], []);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("campanha");
  });

  it("painel duplicado na playlist do device não repete", () => {
    const out = composeDeviceLoop([], [slide(4, "painel")], [slide(4, "playlist")]);
    expect(out.map((s) => s.label)).toEqual(["painel"]);
  });

  it("sem painel publicado o resultado é o de antes", () => {
    const out = composeDeviceLoop([slide(1, "c")], [], [slide(2, "p")]);
    expect(out.map((s) => s.announcementId)).toEqual([1, 2]);
  });

  it("preserva a ordem de cada fonte", () => {
    const out = composeDeviceLoop([], [slide(1, "p1"), slide(2, "p2")], []);
    expect(out.map((s) => s.announcementId)).toEqual([1, 2]);
  });

  // Tipo explícito: as três listas precisam caber no mesmo genérico T.
  type Linha = { announcementId: number; label: string; campaignId?: number; panelId?: number; loopInsertions?: number };
  const campanha = (announcementId: number, campaignId: number, loopInsertions: number): Linha =>
    ({ announcementId, label: `c${announcementId}`, campaignId, loopInsertions });
  const pagina = (announcementId: number, panelId: number): Linha =>
    ({ announcementId, label: `p${announcementId}`, panelId });

  it("campanha 2× com um painel e um item de playlist sai C P L C", () => {
    const out = composeDeviceLoop([campanha(1, 9, 2)], [pagina(2, 5)], [slide(3, "l")]);
    expect(out.map((s) => s.announcementId)).toEqual([1, 2, 3, 1]);
  });

  it("cada inserção toca todas as peças da campanha em sequência", () => {
    const out = composeDeviceLoop([campanha(1, 9, 2), campanha(2, 9, 2)], [], [slide(3, "l")]);
    expect(out.map((s) => s.announcementId)).toEqual([1, 2, 3, 1, 2]);
  });

  it("páginas do mesmo painel ficam juntas; cada painel é um bloco", () => {
    const out = composeDeviceLoop([campanha(1, 9, 2)], [pagina(2, 5), pagina(3, 5), pagina(4, 6)], []);
    expect(out.map((s) => s.announcementId)).toEqual([1, 2, 3, 4, 1]);
  });

  it("peça na campanha 2× e na playlist toca só as inserções da campanha", () => {
    const out = composeDeviceLoop([campanha(1, 9, 2)], [], [slide(1, "l")]);
    expect(out.map((s) => s.label)).toEqual(["c1", "c1"]);
  });
});

describe("buildPanelSlidesQuery", () => {
  // Sem banco e sem rede: `.toSQL()` só monta o texto do SQL e os parâmetros,
  // nunca executa a consulta. É o que garante o escopo por cliente e os
  // filtros que decidem o que aparece numa TV de restaurante — sem isso um
  // painel rascunho, ou o de outro cliente, poderia ir ao ar.
  it("filtra pelo client_id da TV, e o valor passado vai como parâmetro", () => {
    const { sql, params } = buildPanelSlidesQuery(42).toSQL();
    expect(sql).toContain('"panels"."client_id" = $1');
    expect(params[0]).toBe(42);
  });

  it("só traz painel com status published — rascunho não aparece na TV", () => {
    const { sql, params } = buildPanelSlidesQuery(42).toSQL();
    expect(sql).toContain('"panels"."status" = $2');
    expect(params[1]).toBe("published");
  });

  it("só traz peça com announcements.is_active", () => {
    const { sql, params } = buildPanelSlidesQuery(42).toSQL();
    expect(sql).toContain('"announcements"."is_active" = $3');
    expect(params[2]).toBe(true);
  });

  it("ordena por painel (id) e, dentro do painel, por page_no", () => {
    const { sql } = buildPanelSlidesQuery(42).toSQL();
    expect(sql).toContain('order by "panels"."id" asc, "panel_slides"."page_no" asc');
  });

  it("exclui peça de painel que está em campanha (destino da última publicação)", () => {
    const { sql } = buildPanelSlidesQuery(7).toSQL();
    expect(sql).toMatch(/left join "campaign_announcements"/i);
    expect(sql).toMatch(/"campaign_announcements"\."id" is null/i);
    // O filtro não usa panels.campaign_id: trocar o destino no editor sem
    // republicar não pode mudar o que toca.
    expect(sql).not.toMatch(/"panels"\."campaign_id"/i);
  });

  it("traz o panel_id para a volta manter as páginas do painel juntas", () => {
    const { sql } = buildPanelSlidesQuery(42).toSQL();
    // Só a lista do SELECT: o join já cita panel_slides.panel_id.
    expect(sql.split(" from ")[0]).toContain('"panel_slides"."panel_id"');
  });
});
