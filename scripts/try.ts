import { config } from "dotenv";

config({ path: ".env.local" });
config();

import { closeDb } from "../lib/db/client";
import { retrieve, type Persona, type RetrievalMode } from "../lib/rag/retriever";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const flagValues = new Set(["persona", "lang", "k", "mode"].map((n) => arg(n)));
  const query = process.argv.slice(2).filter((a) => !a.startsWith("--") && !flagValues.has(a)).join(" ");
  if (!query) throw new Error('Usage: pnpm try "your question" [--persona shift|office|all] [--lang de|en] [--k 6] [--mode hybrid|vector]');

  const result = await retrieve({
    query,
    persona: (arg("persona") ?? "all") as Persona,
    lang: arg("lang"),
    k: arg("k") ? Number(arg("k")) : undefined,
    mode: arg("mode") as RetrievalMode | undefined,
  });

  console.log(
    `found=${result.found} topScore=${result.topScore.toFixed(4)} bestDist=${result.bestVectorDistance?.toFixed(3)} ${result.latencyMs}ms\n`,
  );
  result.chunks.forEach((c, i) => {
    console.log(`[${i + 1}] ${c.score.toFixed(4)} ${c.lang} ${c.policyId} › ${c.section}`);
    console.log(`    ${c.content.replace(/\s+/g, " ").slice(0, 160)}…`);
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
