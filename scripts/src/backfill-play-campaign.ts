import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  const result = await db.execute(sql`
    UPDATE plays p
    SET campaign_id = sub.campaign_id
    FROM (
      SELECT p2.id AS play_id,
             MIN(c.id) AS campaign_id,
             COUNT(DISTINCT c.id) AS n
      FROM plays p2
      JOIN campaign_announcements ca ON ca.announcement_id = p2.announcement_id
      JOIN campaigns c ON c.id = ca.campaign_id
      WHERE p2.created_at >= greatest(c.starts_at, ca.created_at)
        AND p2.created_at <= c.ends_at
        AND (
          c.all_devices
          OR EXISTS (
            SELECT 1 FROM campaign_devices cd
            WHERE cd.campaign_id = c.id
              AND cd.device_id = p2.device_id
              AND p2.created_at >= cd.created_at
          )
        )
      GROUP BY p2.id
    ) sub
    WHERE p.id = sub.play_id
      AND sub.n = 1
      AND p.campaign_id IS NULL
  `);
  console.log(`Backfill de campaign_id concluído. Plays atribuídos: ${result.rowCount ?? 0}`);
}

main()
  .then(async () => { await pool.end(); process.exit(0); })
  .catch(async (err) => { console.error(err); await pool.end(); process.exit(1); });
