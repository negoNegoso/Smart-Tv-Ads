import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`ALTER TABLE IF EXISTS impressions RENAME TO plays`);
  await db.execute(sql`ALTER TABLE plays ADD COLUMN IF NOT EXISTS campaign_id integer`);
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'plays_campaign_id_campaigns_id_fk'
      ) THEN
        ALTER TABLE plays
          ADD CONSTRAINT plays_campaign_id_campaigns_id_fk
          FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `);
  await db.execute(sql`DROP TABLE IF EXISTS campaign_advertisers`);
  console.log("Migração plays aplicada.");
}

main()
  .then(async () => { await pool.end(); process.exit(0); })
  .catch(async (err) => { console.error(err); await pool.end(); process.exit(1); });
