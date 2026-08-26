import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  const result = await db.execute(sql`
    insert into campaign_announcements (campaign_id, announcement_id)
    select id, announcement_id from campaigns
    on conflict (campaign_id, announcement_id) do nothing
  `);
  console.log(`Backfill concluído. Linhas inseridas: ${result.rowCount ?? 0}`);
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exit(1);
  });
