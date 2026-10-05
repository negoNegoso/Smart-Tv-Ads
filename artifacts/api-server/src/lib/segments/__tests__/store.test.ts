import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Tabelas reais para o SQL do mesclar sair com os nomes de verdade; o
// DATABASE_URL fictício só satisfaz o import de @workspace/db (nada conecta).
const previousDatabaseUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
afterAll(() => {
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
});

const state = vi.hoisted(() => ({
  calls: [] as Array<{ op: string; table?: unknown; values?: unknown; sql?: string }>,
  selects: [] as unknown[][],
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const real = await importOriginal<typeof import("@workspace/db")>();
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const dialect = new PgDialect();
  function chain(result: unknown) {
    const c: Record<string, unknown> = {};
    for (const m of ["from", "where", "for", "orderBy", "returning"]) c[m] = () => c;
    c.then = (res: (v: unknown) => void, rej?: (r: unknown) => void) => Promise.resolve(result).then(res, rej);
    return c;
  }
  const tx = {
    select: () => {
      state.calls.push({ op: "select" });
      return chain(state.selects.shift() ?? []);
    },
    update: (table: unknown) => ({
      set: (values: unknown) => {
        state.calls.push({ op: "update", table, values });
        return chain([]);
      },
    }),
    delete: (table: unknown) => {
      state.calls.push({ op: "delete", table });
      return chain([]);
    },
    execute: (query: Parameters<typeof dialect.sqlToQuery>[0]) => {
      state.calls.push({ op: "execute", sql: dialect.sqlToQuery(query).sql });
      return Promise.resolve();
    },
  };
  return { ...real, db: { ...tx, transaction: (fn: (t: typeof tx) => unknown) => fn(tx) } };
});

const { companiesTable, segmentsTable } = await import("@workspace/db");
const { deleteSegmentIfUnused, mergeSegments, segmentUsageColumns } = await import("../store");
const { QueryBuilder } = await import("drizzle-orm/pg-core");

const ops = () => state.calls.map((c) => c.op);

beforeEach(() => {
  state.calls = [];
  state.selects = [];
});

describe("deleteSegmentIfUnused", () => {
  it("trava a linha antes de contar e apaga quando ninguém usa", async () => {
    state.selects = [[{ id: 7 }], [{ companyCount: 0, campaignCount: 0 }]];
    expect(await deleteSegmentIfUnused(7)).toEqual({ status: "deleted" });
    expect(ops()).toEqual(["select", "select", "delete"]);
    expect(state.calls[2].table).toBe(segmentsTable);
  });

  it("em uso não apaga e devolve as contagens", async () => {
    state.selects = [[{ id: 7 }], [{ companyCount: 3, campaignCount: 2 }]];
    expect(await deleteSegmentIfUnused(7)).toEqual({ status: "in_use", usage: { companyCount: 3, campaignCount: 2 } });
    expect(ops()).not.toContain("delete");
  });

  it("segmento inexistente é not_found sem contar nem apagar", async () => {
    state.selects = [[]];
    expect(await deleteSegmentIfUnused(7)).toEqual({ status: "not_found" });
    expect(ops()).toEqual(["select"]);
  });
});

describe("mergeSegments", () => {
  const destino = { id: 2, slug: "padaria", name: "Padaria", companyCount: 5, campaignCount: 1 };

  it("move empresas e campanhas para o destino e apaga a origem, nessa ordem", async () => {
    state.selects = [[{ id: 1 }, { id: 2 }], [destino]];
    expect(await mergeSegments(1, 2)).toEqual({ status: "merged", target: destino });
    expect(ops()).toEqual(["select", "update", "execute", "delete", "select"]);
    expect(state.calls[1]).toMatchObject({ table: companiesTable, values: { segmentId: 2 } });
    expect(state.calls[3].table).toBe(segmentsTable);
  });

  it("copia o alvo das campanhas sem duplicar quem já mirava os dois", async () => {
    state.selects = [[{ id: 1 }, { id: 2 }], [destino]];
    await mergeSegments(1, 2);
    const insert = state.calls.find((c) => c.op === "execute")!.sql!;
    expect(insert).toContain('insert into "campaign_segments" (campaign_id, segment_id)');
    expect(insert).toContain("on conflict do nothing");
  });

  it("origem ou destino inexistente é not_found sem gravar nada", async () => {
    state.selects = [[{ id: 1 }]];
    expect(await mergeSegments(1, 2)).toEqual({ status: "not_found" });
    expect(ops()).toEqual(["select"]);
  });
});

describe("segmentUsageColumns", () => {
  it("qualifica a coluna da linha externa nas subconsultas correlacionadas", () => {
    // Em select de tabela única o drizzle imprime `"id"` sem prefixo, e o
    // Postgres o resolveria para a tabela de dentro: a contagem sairia errada.
    const { sql: texto } = new QueryBuilder()
      .select({ id: segmentsTable.id, ...segmentUsageColumns })
      .from(segmentsTable)
      .toSQL();
    expect(texto).toContain('"companies"."segment_id" = "segments"."id"');
    expect(texto).toContain('"campaign_segments"."segment_id" = "segments"."id"');
  });
});
