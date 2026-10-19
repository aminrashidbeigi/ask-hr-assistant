import fs from "node:fs";
import path from "node:path";

/**
 * Builds eval/reports/comparison.md from the newest report of each tag.
 * Usage: pnpm eval:compare [tagA=vector] [tagB=hybrid]
 */
const dir = path.join(import.meta.dirname, "reports");
const [tagA = "vector", tagB = "hybrid"] = process.argv.slice(2);

function newest(tag: string) {
  const file = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(`-${tag}.json`))
    .sort()
    .pop();
  if (!file) throw new Error(`No report tagged "${tag}" in eval/reports — run: pnpm eval --mode ${tag} --tag ${tag}`);
  return { file, ...JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) };
}

const a = newest(tagA);
const b = newest(tagB);

const pct = (v: number | null | undefined) => (v == null ? "n/a" : `${(v * 100).toFixed(0)} %`);
const sec = (v: number | null | undefined) => (v == null ? "n/a" : `${(v / 1000).toFixed(1)} s`);
const usd = (v: number | null | undefined) => (v == null ? "n/a" : `$${v.toFixed(5)}`);

type N = number | null;
/** The subset of the report summary this script reads. */
interface Summary {
  retrieval: { recall: N; mrr: N; chunkRecall3: N; chunkMrr: N };
  correctness: N;
  faithfulness: N;
  citationValidity: N;
  refusalAccuracy: N;
  falseRefusalRate: N;
  falseAnswerRate: N;
  injectionResistance: N;
  ops: { latencyP95: N; costPerQueryUsd: N; hypotheticalGpt4oMiniPerQueryUsd: N };
}

const k = 6;
const rows: [string, (s: Summary) => string][] = [
  [`Doc Recall@${k}`, (s) => pct(s.retrieval.recall)],
  ["Doc MRR", (s) => s.retrieval.mrr?.toFixed(3) ?? "n/a"],
  [`Chunk Recall@3 (answer-bearing chunk)`, (s) => pct(s.retrieval.chunkRecall3)],
  ["Chunk MRR", (s) => s.retrieval.chunkMrr?.toFixed(3) ?? "n/a"],
  ["Answer correctness (LLM judge)", (s) => pct(s.correctness)],
  ["Faithfulness", (s) => pct(s.faithfulness)],
  ["Citation validity", (s) => pct(s.citationValidity)],
  ["Refusal accuracy", (s) => pct(s.refusalAccuracy)],
  ["False-refusal rate", (s) => pct(s.falseRefusalRate)],
  ["False-answer rate", (s) => pct(s.falseAnswerRate)],
  ["Injection resistance", (s) => pct(s.injectionResistance)],
  ["Latency p95", (s) => sec(s.ops.latencyP95)],
  ["Cost / query (free tier = 0)", (s) => usd(s.ops.costPerQueryUsd)],
  ["Same tokens at gpt-4o-mini list price", (s) => usd(s.ops.hypotheticalGpt4oMiniPerQueryUsd)],
];

const lines = [
  `| Metric | ${tagA === "vector" ? "Vector-only" : tagA} | ${tagB === "hybrid" ? "Hybrid + RRF" : tagB} |`,
  "| --- | --- | --- |",
  ...rows.map(([name, f]) => `| ${name} | ${f(a.summary)} | ${f(b.summary)} |`),
];
const out = `# ${tagA} vs ${tagB}

${lines.join("\n")}

Sources: \`${a.file}\`, \`${b.file}\` (${a.meta.Questions}; chat model ${a.meta["Chat model"]}; judge ${a.meta["Judge model"]}).
`;
fs.writeFileSync(path.join(dir, "comparison.md"), out);
console.log(out);
