import { afterAll, describe, expect, it } from "vitest";

// `.toSQL()` só monta o SQL, nunca conecta; o DATABASE_URL fictício é só para
// o import de @workspace/db, e é desfeito no fim para não vazar para outro
// arquivo no mesmo worker.
const previousDatabaseUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";

afterAll(() => {
  if (previousDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = previousDatabaseUrl;
  }
});

const {
  buildStretchSessionQuery,
  buildOpenSessionQuery,
  buildPruneSessionsQuery,
  buildListSessionsQuery,
} = await import("../device-sessions");

const NOW = new Date("2026-10-02T15:00:00.000Z");
const CINCO_MIN = 5 * 60 * 1000;
const TRINTA_DIAS = 30 * 24 * 60 * 60 * 1000;

// O drizzle entrega o timestamp como Date ou como texto ISO, conforme a
// versão; o que importa aqui é o instante.
const instante = (param: unknown) => new Date(param as string | Date).getTime();

describe("consultas das sessões de conexão", () => {
  it("esticar: só a sessão desta TV vista nos últimos 5 minutos", () => {
    const { sql, params } = buildStretchSessionQuery(7, NOW).toSQL();
    expect(sql).toContain('update "device_sessions" set "last_seen_at" = $1');
    expect(sql).toContain('"device_sessions"."device_id" = $2');
    expect(sql).toContain('"device_sessions"."last_seen_at" >= $3');
    expect(instante(params[0])).toBe(NOW.getTime());
    expect(params[1]).toBe(7);
    expect(instante(params[2])).toBe(NOW.getTime() - CINCO_MIN);
  });

  it("abrir: começo e último contato no mesmo instante", () => {
    const { sql, params } = buildOpenSessionQuery(7, NOW).toSQL();
    expect(sql).toContain('insert into "device_sessions"');
    expect(params).toContain(7);
    expect(params.filter((p) => p !== 7).map(instante)).toEqual([NOW.getTime(), NOW.getTime()]);
  });

  // "Não toca nas de outra TV": o filtro por device_id tem de estar no DELETE.
  it("limpar: só as sessões desta TV com mais de 30 dias", () => {
    const { sql, params } = buildPruneSessionsQuery(7, NOW).toSQL();
    expect(sql).toContain('delete from "device_sessions"');
    expect(sql).toContain('"device_sessions"."device_id" = $1');
    expect(sql).toContain('"device_sessions"."last_seen_at" < $2');
    expect(params[0]).toBe(7);
    expect(instante(params[1])).toBe(NOW.getTime() - TRINTA_DIAS);
  });

  it("listar: últimos 30 dias desta TV, da mais nova para a mais antiga", () => {
    const { sql, params } = buildListSessionsQuery(7, NOW).toSQL();
    expect(sql).toContain('from "device_sessions"');
    expect(sql).toContain('"device_sessions"."device_id" = $1');
    expect(sql).toContain('"device_sessions"."last_seen_at" >= $2');
    expect(sql).toContain('order by "device_sessions"."started_at" desc');
    expect(params[0]).toBe(7);
    expect(instante(params[1])).toBe(NOW.getTime() - TRINTA_DIAS);
  });
});
