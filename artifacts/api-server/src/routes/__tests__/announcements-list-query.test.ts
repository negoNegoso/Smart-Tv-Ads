// artifacts/api-server/src/routes/__tests__/announcements-list-query.test.ts
import { afterAll, describe, expect, it } from "vitest";

// `.toSQL()` só monta o SQL; o DATABASE_URL fictício é só para o import de
// @workspace/db e é desfeito no fim (mesmo truque de device-feed-query.test).
const previousDatabaseUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
afterAll(() => {
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
});

const { buildAnnouncementsListQuery, buildAnnouncementStatsQuery } = await import("../announcements");

describe("buildAnnouncementsListQuery", () => {
  it("deixa de fora as artes de aviso urgente", () => {
    const { sql, params } = buildAnnouncementsListQuery().toSQL();
    expect(sql).toContain('"announcements"."source" <> $1');
    expect(params[0]).toBe("alert");
  });
});

describe("buildAnnouncementStatsQuery", () => {
  it("não conta as artes de aviso urgente", () => {
    const { sql, params } = buildAnnouncementStatsQuery().toSQL();
    expect(sql).toContain('"announcements"."source" <> $1');
    expect(params).toContain("alert");
  });
});
