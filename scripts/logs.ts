import { config } from "dotenv";
import { sql } from "drizzle-orm";

config({ path: ".env.local" });
config();

import { closeDb, getDb } from "../lib/db/client";

/** Prints the most recent query_logs rows (redacted data only): `pnpm logs [count]` */
async function main() {
  const limit = Number(process.argv[2] ?? 8);
  const rows = await getDb().execute(sql`
    SELECT left(question_redacted, 42) AS question, persona, lang, refused, escalated,
           tool_calls AS tools, latency_ms AS ms, ttft_ms AS ttft, input_tokens AS in_tok,
           output_tokens AS out_tok, cost_usd AS cost, model, prompt_version AS pv,
           coalesce(array_length(retrieved_chunk_ids, 1), 0) AS chunks,
           round(top_score::numeric, 4) AS top, left(coalesce(error, ''), 28) AS error
    FROM query_logs ORDER BY created_at DESC LIMIT ${limit}`);
  console.table(rows);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
