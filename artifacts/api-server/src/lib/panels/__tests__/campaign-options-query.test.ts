import { afterAll, describe, expect, it } from "vitest";

// `.toSQL()` só monta o SQL, nunca conecta; o DATABASE_URL fictício é só
// para o import de @workspace/db e é desfeito no fim (workers reaproveitados).
const previousDatabaseUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";

afterAll(() => {
  if (previousDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = previousDatabaseUrl;
  }
});

const { buildCampaignOptionsQuery } = await import("../queries");

describe("buildCampaignOptionsQuery", () => {
  it("só oferece campanha ativa, não encerrada, da empresa da loja", () => {
    const { sql, params } = buildCampaignOptionsQuery(7, new Date("2026-09-24T12:00:00Z")).toSQL();
    expect(sql).toContain('"clients"."id" = $1');
    expect(params[0]).toBe(7);
    expect(sql).toContain('"campaigns"."ends_at" > $2');
    expect(sql).toContain('"campaigns"."is_active" = $3');
    expect(params[2]).toBe(true);
  });
});
