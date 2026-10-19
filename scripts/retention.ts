import { config } from "dotenv";
import { sql } from "drizzle-orm";

config({ path: ".env.local" });
config();

import { closeDb, getDb } from "../lib/db/client";

/** GDPR data minimisation: delete query logs (and their feedback, via cascade) older than N days (default 90). */
async function main() {
  const days = Number(process.argv[2] ?? process.env.RETENTION_DAYS ?? 90);
  if (!Number.isInteger(days) || days < 1) throw new Error("retention days must be a positive integer");
  const deleted = await getDb().execute(
    sql`DELETE FROM query_logs WHERE created_at < now() - make_interval(days => ${days}::int) RETURNING id`,
  );
  console.log(`Deleted ${deleted.length} query_logs rows older than ${days} days (feedback cascades).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
