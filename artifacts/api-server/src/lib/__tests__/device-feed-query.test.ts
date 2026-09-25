import { afterAll, describe, expect, it } from "vitest";

// Mesmo truque do device-slides.test: `.toSQL()` só monta o SQL, nunca
// conecta; o DATABASE_URL fictício é só para o import de @workspace/db, e é
// desfeito no fim para não vazar para outro arquivo no mesmo worker.
const previousDatabaseUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";

afterAll(() => {
  if (previousDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = previousDatabaseUrl;
  }
});

const { buildCampaignSlidesQuery } = await import("../device-feed");

describe("buildCampaignSlidesQuery", () => {
  it("ordena por campanha e, dentro dela, pela ordem das peças (páginas do encarte em sequência)", () => {
    const { sql } = buildCampaignSlidesQuery(new Date("2026-09-24T12:00:00Z")).toSQL();
    expect(sql).toContain(
      'order by "campaigns"."id" asc, "announcements"."display_order" asc, "announcements"."id" asc',
    );
  });
});
