import { afterAll, describe, expect, it } from "vitest";

const previousDatabaseUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
afterAll(() => {
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
});

const { buildQuoteNetworkQuery } = await import("../store");

describe("buildQuoteNetworkQuery", () => {
  it("deixa a vitrine de fora (ela não é tela de loja para vender)", () => {
    const { sql, params } = buildQuoteNetworkQuery().toSQL();
    expect(sql).toContain('"devices"."showcase"');
    expect(params).toContain(false);
  });
});
