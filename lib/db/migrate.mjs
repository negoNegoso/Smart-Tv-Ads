// Aplica as migrações Drizzle versionadas (pasta ./drizzle) ao banco.
// Executado no build de deploy (ver scripts/build-vercel.mjs) e utilizável
// localmente com `pnpm --filter db run migrate`.
//
// Preferimos uma conexão não-poolizada para DDL. Se nenhuma URL de banco
// estiver presente no ambiente (ex.: build de preview sem banco), pulamos
// silenciosamente para não quebrar o build.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";

const url =
  process.env.MIGRATE_DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;

if (!url) {
  console.warn("[migrate] Nenhuma URL de banco no ambiente; pulando migrações.");
  process.exit(0);
}

const { Pool } = pg;
const pool = new Pool({ connectionString: url });
const db = drizzle(pool);
const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "drizzle");

try {
  await migrate(db, { migrationsFolder });
  console.log("[migrate] Migrações aplicadas com sucesso.");
} catch (err) {
  console.error("[migrate] Falha ao aplicar migrações:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
