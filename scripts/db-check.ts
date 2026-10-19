import { config } from "dotenv";
import { sql } from "drizzle-orm";

config({ path: ".env.local" });
config();

import { closeDb, getDb } from "../lib/db/client";

async function main() {
  const db = getDb();
  const [ok] = await db.execute(sql`SELECT 1 AS ok`);
  const [ext] = await db.execute(sql`SELECT extversion FROM pg_extension WHERE extname = 'vector'`);
  const tables = await db.execute(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`,
  );
  const indexes = await db.execute(
    sql`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname NOT LIKE '%_pkey' ORDER BY 1`,
  );
  const [tsv] = await db.execute(
    sql`SELECT is_generated FROM information_schema.columns WHERE table_name = 'chunks' AND column_name = 'tsv'`,
  );
  const [counts] = await db.execute(
    sql`SELECT (SELECT count(*) FROM documents)::int AS documents, (SELECT count(*) FROM chunks)::int AS chunks`,
  );
  console.log(
    JSON.stringify(
      {
        select1: ok.ok,
        pgvector: ext?.extversion ?? null,
        tables: tables.map((t) => t.tablename),
        indexes: indexes.map((i) => i.indexname),
        tsvGenerated: tsv?.is_generated,
        ...counts,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
