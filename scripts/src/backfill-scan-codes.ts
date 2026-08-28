import { db, pool, campaignAnnouncementsTable } from "@workspace/db";
import { generateScanCode } from "@workspace/db/scan-code";
import { eq, isNull } from "drizzle-orm";

async function main() {
  const pendentes = await db
    .select({ id: campaignAnnouncementsTable.id })
    .from(campaignAnnouncementsTable)
    .where(isNull(campaignAnnouncementsTable.scanCode));

  let atualizados = 0;
  for (const linha of pendentes) {
    await db
      .update(campaignAnnouncementsTable)
      .set({ scanCode: generateScanCode() })
      .where(eq(campaignAnnouncementsTable.id, linha.id));
    atualizados += 1;
  }

  console.log(`Backfill concluído. Vínculos com scanCode gerado: ${atualizados}`);
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
