import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// One connection per instance: a serverless invocation serves a single request
// at a time, and instance count scales with traffic, so a larger pool only
// multiplies idle connections against the database.
export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
export const db = drizzle(pool, { schema });

export * from "./schema";
