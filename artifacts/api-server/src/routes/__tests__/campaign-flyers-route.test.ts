import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

/**
 * Fake de banco com dispatch por identidade de tabela, no espírito do
 * fakeTx de publish.test.ts. As tabelas usadas são as reais de
 * @workspace/db/schema (não stubs `{ id: "id" }`): o teste "PATCH não apaga
 * peças de encarte" precisa que eq/and/notInArray produzam SQL de verdade
 * para inspecionar via PgDialect, então as colunas têm que ser Column
 * de verdade.
 */
const state = vi.hoisted(() => ({
  existingCampaignRow: null as Record<string, unknown> | null,
  advertiserRow: null as Record<string, unknown> | null,
  joinedStatsRow: null as Record<string, unknown> | null,
  devicesRows: [] as unknown[],
  insertCampaignReturning: null as Record<string, unknown> | null,
  insertCalls: [] as Array<{ table: string; values: unknown }>,
  updateCalls: [] as Array<{ table: string; patch: unknown }>,
  deleteCalls: [] as Array<{ table: string; cond: unknown }>,
  callLog: [] as string[],
}));

function resetState() {
  state.existingCampaignRow = null;
  state.advertiserRow = null;
  state.joinedStatsRow = null;
  state.devicesRows = [];
  state.insertCampaignReturning = null;
  state.insertCalls = [];
  state.updateCalls = [];
  state.deleteCalls = [];
  state.callLog = [];
}

vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const {
    campaignsTable,
    advertisersTable,
    campaignAnnouncementsTable,
    campaignDevicesTable,
    campaignSegmentsTable,
    announcementsTable,
    devicesTable,
  } = schema;

  function thenable(value: unknown) {
    return {
      then: (res: (v: unknown) => void, rej?: (r: unknown) => void) => Promise.resolve(value).then(res, rej),
      catch: (rej: (r: unknown) => void) => Promise.resolve(value).catch(rej),
    };
  }

  function tableName(table: unknown): string {
    if (table === campaignsTable) return "campaigns";
    if (table === advertisersTable) return "advertisers";
    if (table === campaignAnnouncementsTable) return "campaign_announcements";
    if (table === campaignDevicesTable) return "campaign_devices";
    if (table === campaignSegmentsTable) return "campaign_segments";
    if (table === announcementsTable) return "announcements";
    if (table === devicesTable) return "devices";
    return "desconhecida";
  }

  function selectResolve(table: unknown, hasJoin: boolean): unknown {
    if (table === campaignsTable) {
      if (hasJoin) return state.joinedStatsRow ? [state.joinedStatsRow] : [];
      return state.existingCampaignRow ? [state.existingCampaignRow] : [];
    }
    if (table === advertisersTable) return state.advertiserRow ? [state.advertiserRow] : [];
    if (table === campaignDevicesTable) return state.devicesRows;
    return [];
  }

  const db = {
    select(_cols?: unknown) {
      let hasJoin = false;
      return {
        from(table: unknown) {
          const terminal: Record<string, unknown> = {
            innerJoin(_t: unknown, _c: unknown) {
              hasJoin = true;
              return terminal;
            },
            where(cond: unknown) {
              // Subconsulta de peças de painel: devolve a própria condição
              // real (já um SQL com getSQL() implementado), que é como o
              // notInArray do drizzle embute isto como subquery.
              if (table === announcementsTable) return cond;
              return thenable(selectResolve(table, hasJoin));
            },
          };
          return terminal;
        },
      };
    },
    insert(table: unknown) {
      return {
        values(values: unknown) {
          state.insertCalls.push({ table: tableName(table), values });
          return {
            ...thenable(undefined),
            onConflictDoNothing: () => thenable(undefined),
            returning: () => thenable(table === campaignsTable ? [state.insertCampaignReturning] : []),
          };
        },
      };
    },
    update(table: unknown) {
      return {
        set(patch: unknown) {
          state.updateCalls.push({ table: tableName(table), patch });
          return { where: (_cond: unknown) => thenable(undefined) };
        },
      };
    },
    delete(table: unknown) {
      return {
        where(cond: unknown) {
          state.deleteCalls.push({ table: tableName(table), cond });
          if (table === campaignsTable) state.callLog.push("delete-campaign");
          return thenable(undefined);
        },
      };
    },
  };

  return { db, ...schema };
});

const republishCampaignFlyersSpy = vi.fn();
const unpublishCampaignFlyersSpy = vi.fn();
vi.mock("../../lib/panels/campaign-flyers", () => ({
  republishCampaignFlyers: (...a: unknown[]) => {
    state.callLog.push(`republish:${a[0]}`);
    return republishCampaignFlyersSpy(...a);
  },
  unpublishCampaignFlyers: (...a: unknown[]) => {
    state.callLog.push(`unpublish:${a[0]}`);
    return unpublishCampaignFlyersSpy(...a);
  },
}));

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: router } = await import("../advertisers");
  const app = express();
  app.use(express.json());
  app.use(router);
  return app;
}

const ADVERTISER_ID = 1;
const CAMPAIGN_ID = 42;
const STARTS_AT = "2026-02-01T00:00:00.000Z";
const ENDS_AT = "2026-02-15T00:00:00.000Z";

function baseExisting(over: Record<string, unknown> = {}) {
  return {
    id: CAMPAIGN_ID,
    advertiserId: ADVERTISER_ID,
    name: "Campanha existente",
    contractValue: 100,
    startsAt: new Date(STARTS_AT),
    endsAt: new Date(ENDS_AT),
    targetMode: "all",
    weekdays: [],
    allDevices: true,
    isActive: true,
    ...over,
  };
}

function joinedFrom(existing: Record<string, unknown>) {
  return {
    ...existing,
    advertiserName: "Anunciante",
    company: "Empresa",
    deviceIds: [],
    announcementIds: [],
    announcementTitles: [],
    segmentIds: [],
    segmentNames: [],
    plays: 0,
    totalDuration: 0,
    playsByAnnouncement: [],
    announcementLinks: [],
    scans: 0,
  };
}

function campaignBody(over: Record<string, unknown> = {}) {
  return {
    advertiserId: ADVERTISER_ID,
    name: "Campanha Y",
    startsAt: STARTS_AT,
    endsAt: ENDS_AT,
    announcementIds: [] as number[],
    ...over,
  };
}

describe("rotas de campanha convivendo com encartes", () => {
  let app: Express;

  beforeEach(async () => {
    resetState();
    republishCampaignFlyersSpy.mockReset();
    unpublishCampaignFlyersSpy.mockReset();
    state.advertiserRow = { id: ADVERTISER_ID };
    state.insertCampaignReturning = { id: CAMPAIGN_ID };
    state.joinedStatsRow = joinedFrom(baseExisting());
    app = await buildApp();
  });

  it("POST sem anúncios é aceito", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).post("/campaigns").send(campaignBody());
    expect(res.status).toBe(201);
    expect(state.insertCalls.some((c) => c.table === "campaign_announcements")).toBe(false);
  });

  it("PATCH sem anúncios avulsos é aceito (campanha só de encarte)", async () => {
    state.existingCampaignRow = baseExisting();
    const { default: request } = await import("supertest");
    const res = await request(app).patch(`/campaigns/${CAMPAIGN_ID}`).send(campaignBody());
    expect(res.status).toBe(200);
    expect(state.insertCalls.some((c) => c.table === "campaign_announcements")).toBe(false);
  });

  it("PATCH não apaga peças de encarte da campanha", async () => {
    state.existingCampaignRow = baseExisting();
    const { default: request } = await import("supertest");
    const res = await request(app)
      .patch(`/campaigns/${CAMPAIGN_ID}`)
      .send(campaignBody({ announcementIds: [7] }));
    expect(res.status).toBe(200);

    const deleteCall = state.deleteCalls.find((c) => c.table === "campaign_announcements");
    expect(deleteCall).toBeDefined();
    const query = new PgDialect().sqlToQuery(deleteCall!.cond as never);
    // A condição precisa excluir quem tem source = 'panel' — a peça de
    // encarte não pode ser apagada pelo formulário, que nem a conhece.
    expect(query.sql).toContain("not in");
    expect(query.sql).toContain('"source"');
    expect(query.params).toContain("panel");
  });

  it("PATCH que muda datas republica os encartes", async () => {
    state.existingCampaignRow = baseExisting();
    const { default: request } = await import("supertest");
    const res = await request(app)
      .patch(`/campaigns/${CAMPAIGN_ID}`)
      .send(campaignBody({ startsAt: "2026-03-01T00:00:00.000Z", endsAt: "2026-03-15T00:00:00.000Z" }));
    expect(res.status).toBe(200);
    expect(republishCampaignFlyersSpy).toHaveBeenCalledWith(CAMPAIGN_ID);
  });

  it("PATCH sem mudar datas não republica", async () => {
    state.existingCampaignRow = baseExisting();
    const { default: request } = await import("supertest");
    const res = await request(app).patch(`/campaigns/${CAMPAIGN_ID}`).send(campaignBody());
    expect(res.status).toBe(200);
    expect(republishCampaignFlyersSpy).not.toHaveBeenCalled();
  });

  it("DELETE despublica os encartes antes de apagar", async () => {
    state.existingCampaignRow = baseExisting();
    const { default: request } = await import("supertest");
    const res = await request(app).delete(`/campaigns/${CAMPAIGN_ID}`);
    expect(res.status).toBe(204);
    expect(unpublishCampaignFlyersSpy).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(state.callLog).toEqual([`unpublish:${CAMPAIGN_ID}`, "delete-campaign"]);
  });
});
