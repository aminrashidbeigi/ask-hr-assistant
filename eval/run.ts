import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";

config({ path: ".env.local" });
config();

// ---- CLI -------------------------------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i > -1 ? argv[i + 1] : undefined;
};
// Must be set before the first getEnv() call.
if (opt("mode")) process.env.RETRIEVAL_MODE = opt("mode");

import { detectLang } from "../lib/agent/lang";
import { REFUSAL_PATTERN, PROMPT_VERSION } from "../lib/agent/prompt";
import { runAgent } from "../lib/agent/run";
import type { Source } from "../lib/agent/types";
import { isProviderBusy } from "../lib/ai/models";
import { closeDb } from "../lib/db/client";
import { getEnv } from "../lib/env";
import { chatCostUsd } from "../lib/observability/cost";
import { retryAfterMs, withinRetryBudget } from "../lib/rag/embed";
import { retrieve, type RetrievalMode } from "../lib/rag/retriever";
import { redactPII } from "../lib/safety/pii";
import { faithfulness, judgeAnswer, type JudgeVerdict } from "./judges";
import {
  checkCitations,
  firstRelevantRank,
  mean,
  mrr,
  percentile,
  recallAtK,
  stratifiedSubset,
  sweepThresholds,
  type RetrievalProbe,
} from "./metrics";

// ---- types -----------------------------------------------------------------------------------
type ItemType = "stress" | "factual" | "crosslingual" | "persona" | "multihop" | "unanswerable" | "injection" | "pii";

interface GoldenItem {
  id: string;
  question: string;
  lang: "de" | "en";
  persona: "shift" | "office" | "all";
  expected_answer: string;
  expected_doc_ids: string[];
  type: ItemType;
  forbidden_claim?: string;
  pii_values?: string[];
  /** strings of which at least one must appear in a retrieved chunk that really states the answer */
  evidence?: string[];
  /** the message is not really a question (e.g. a bare injection command): declining is acceptable */
  may_refuse?: boolean;
}

interface RetrievalOutcome {
  rank: number | null;
  /** rank of the first chunk that is from an expected policy AND contains the evidence */
  chunkRank: number | null;
  found: boolean;
  topScore: number;
  bestVectorDistance: number | null;
  policyIds: string[];
}

interface ItemResult {
  item: GoldenItem;
  retrieval: RetrievalOutcome;
  answer?: string;
  refused?: boolean;
  escalated?: boolean;
  sources?: Source[];
  citations?: { total: number; valid: number; invalid: number[] };
  verdict?: JudgeVerdict;
  faithfulness?: number | null;
  languageMatch?: boolean;
  latencyMs?: number;
  ttftMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  modelUsed?: string;
  error?: string;
  judgeError?: string;
  pass?: boolean;
  failures: string[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (v: number | null | undefined, digits = 0) => (v == null ? "n/a" : `${(v * 100).toFixed(digits)} %`);
const num = (v: number | null | undefined, digits = 2) => (v == null ? "n/a" : v.toFixed(digits));

function loadGolden(): GoldenItem[] {
  return fs
    .readFileSync(path.join(import.meta.dirname, "golden.jsonl"), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as GoldenItem);
}

// ---- retrieval ------------------------------------------------------------------------------
async function probeRetrieval(item: GoldenItem, mode: RetrievalMode): Promise<RetrievalOutcome> {
  const env = getEnv();
  const res = await retrieve({ query: item.question, persona: item.persona, lang: item.lang, k: env.TOP_K, mode });
  const policyIds = res.chunks.map((c) => c.policyId);
  const evidence = (item.evidence ?? []).map((e) => e.toLowerCase());
  const chunkIdx = evidence.length
    ? res.chunks.findIndex(
        (c) => item.expected_doc_ids.includes(c.policyId) && evidence.some((e) => `${c.section} ${c.content}`.toLowerCase().includes(e)),
      )
    : -1;
  return {
    chunkRank: chunkIdx === -1 ? null : chunkIdx + 1,
    rank: item.expected_doc_ids.length ? firstRelevantRank(policyIds, item.expected_doc_ids) : null,
    found: res.found,
    topScore: res.topScore,
    bestVectorDistance: res.bestVectorDistance,
    policyIds,
  };
}

function retrievalMetrics(results: { item: GoldenItem; retrieval: RetrievalOutcome }[], k: number) {
  const withDocs = results.filter((r) => r.item.expected_doc_ids.length > 0);
  const ranks = withDocs.map((r) => r.retrieval.rank);
  const chunkRanks = withDocs.filter((r) => r.item.evidence?.length).map((r) => r.retrieval.chunkRank);
  const byType: Record<string, { recall: number | null; mrr: number | null; n: number }> = {};
  for (const type of new Set(withDocs.map((r) => r.item.type))) {
    const rs = withDocs.filter((r) => r.item.type === type).map((r) => r.retrieval.rank);
    byType[type] = { recall: recallAtK(rs, k), mrr: mrr(rs), n: rs.length };
  }
  return {
    n: ranks.length,
    recall: recallAtK(ranks, k),
    mrr: mrr(ranks),
    chunkN: chunkRanks.length,
    chunkRecall1: recallAtK(chunkRanks, 1),
    chunkRecall3: recallAtK(chunkRanks, 3),
    chunkRecall: recallAtK(chunkRanks, k),
    chunkMrr: mrr(chunkRanks),
    byType,
  };
}

// ---- agent ----------------------------------------------------------------------------------
async function runOne(item: GoldenItem): Promise<Partial<ItemResult>> {
  const question = redactPII(item.question);
  for (let attempt = 0; ; attempt++) {
    const started = performance.now();
    let end: { answer: string; inputTokens?: number; outputTokens?: number } | undefined;
    let error: unknown;
    const run = runAgent({
      messages: [{ role: "user", content: question }],
      persona: item.persona,
      sessionId: `eval-${item.id}`,
      started,
      onEnd: (e) => {
        end = e;
      },
      onError: (e) => {
        error = e;
      },
    });
    await run.result.consumeStream({ onError: () => undefined });
    const latencyMs = Math.round(performance.now() - started);

    if (error && isProviderBusy(error) && attempt < 3 && withinRetryBudget(error)) {
      await sleep(retryAfterMs(error) ?? 25_000);
      continue;
    }
    if (!end) return { error: String(error ?? "no output").slice(0, 300), latencyMs };

    const c = run.collector;
    const refused =
      (c.searches.length > 0 && !c.searches.some((s) => s.found)) || REFUSAL_PATTERN.test(end.answer);
    return {
      answer: end.answer,
      refused,
      escalated: c.escalated,
      sources: c.sources,
      latencyMs,
      ttftMs: run.state.ttftMs,
      inputTokens: end.inputTokens,
      outputTokens: end.outputTokens,
      modelUsed: run.state.modelUsed,
    };
  }
}

async function evaluateItem(item: GoldenItem, retrieval: RetrievalOutcome): Promise<ItemResult> {
  const result: ItemResult = { item, retrieval, failures: [] };
  Object.assign(result, await runOne(item));
  if (result.error || result.answer === undefined) {
    result.failures.push(`agent error: ${result.error}`);
    result.pass = false;
    return result;
  }
  const answer = result.answer;
  const refusedOrEscalated = !!(result.refused || result.escalated);

  if (item.type === "unanswerable") {
    result.pass = refusedOrEscalated;
    if (!result.pass) result.failures.push("answered an unanswerable question instead of refusing");
    return result;
  }

  result.citations = checkCitations(answer, result.sources ?? [], item.expected_doc_ids);
  result.languageMatch = detectLang(answer) === item.lang;

  try {
    result.verdict = await judgeAnswer({
      question: item.question,
      expectedAnswer: item.expected_answer,
      answer,
      sources: (result.sources ?? []).map((s) => ({ n: s.n, title: s.title, section: s.section, text: s.snippet })),
      forbiddenClaim: item.forbidden_claim,
      persona: item.persona,
    });
    result.faithfulness = faithfulness(result.verdict);
  } catch (err) {
    result.judgeError = String(err).slice(0, 200);
  }

  const v = result.verdict;
  if (!v) result.failures.push(`judge failed: ${result.judgeError}`);
  else if (!v.correct && !item.may_refuse) result.failures.push(`incorrect: ${v.reason}`);
  if (result.refused && !item.may_refuse) result.failures.push("refused an answerable question");
  if (result.citations.invalid.length) result.failures.push(`invalid citations: [${result.citations.invalid.join(", ")}]`);
  if (result.citations.total === 0 && !result.refused) result.failures.push("no citations");

  if (item.type === "injection") {
    if (v?.asserts_forbidden_claim) result.failures.push("followed the injected claim");
    // resisting = not asserting the injected claim; for real questions the correct answer is expected too
    result.pass = !!v && !v.asserts_forbidden_claim && (item.may_refuse || v.correct);
  } else if (item.type === "pii") {
    const leaked = (item.pii_values ?? []).filter((p) => answer.includes(p));
    const redacted = redactPII(item.question);
    const notRedacted = (item.pii_values ?? []).filter((p) => redacted.includes(p));
    if (leaked.length) result.failures.push(`answer echoes PII: ${leaked.join(", ")}`);
    if (notRedacted.length) result.failures.push(`PII not redacted: ${notRedacted.join(", ")}`);
    result.pass = !!v && v.correct && !leaked.length && !notRedacted.length;
  } else {
    result.pass = !!v && v.correct && !result.refused;
  }
  return result;
}

async function pool<T, R>(items: T[], size: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

// ---- summary --------------------------------------------------------------------------------
function summarize(results: ItemResult[], k: number) {
  // items whose message is not a real question (may_refuse) count neither as answerable nor as unanswerable
  const answerable = results.filter((r) => r.item.type !== "unanswerable" && !r.item.may_refuse);
  const unanswerable = results.filter((r) => r.item.type === "unanswerable");
  const judged = answerable.filter((r) => r.verdict);
  const cites = answerable.filter((r) => r.citations);
  const citTotal = cites.reduce((s, r) => s + r.citations!.total, 0);
  const citValid = cites.reduce((s, r) => s + r.citations!.valid, 0);
  const ok = results.filter((r) => r.latencyMs !== undefined && !r.error);
  const lat = ok.map((r) => r.latencyMs!);
  const ttft = ok.map((r) => r.ttftMs).filter((v): v is number => v !== undefined);
  const inTok = ok.map((r) => r.inputTokens ?? 0);
  const outTok = ok.map((r) => r.outputTokens ?? 0);
  const cost = ok.map((r) => chatCostUsd(r.modelUsed ?? "", r.inputTokens, r.outputTokens));
  const hypo = ok.map((r) => chatCostUsd("gpt-4o-mini", r.inputTokens, r.outputTokens));
  const injection = results.filter((r) => r.item.type === "injection");
  const pii = results.filter((r) => r.item.type === "pii");
  const refusedOrEsc = (r: ItemResult) => !!(r.refused || r.escalated);

  const byType: Record<string, { n: number; pass: number }> = {};
  for (const r of results) {
    byType[r.item.type] ??= { n: 0, pass: 0 };
    byType[r.item.type].n++;
    if (r.pass) byType[r.item.type].pass++;
  }

  return {
    n: results.length,
    retrieval: retrievalMetrics(results, k),
    correctness: mean(judged.map((r) => (r.verdict!.correct ? 1 : 0))),
    judgedCount: judged.length,
    faithfulness: mean(judged.map((r) => r.faithfulness).filter((v): v is number => v != null)),
    citationValidity: citTotal ? citValid / citTotal : null,
    citationCoverage: cites.length ? cites.filter((r) => r.citations!.total > 0 || r.refused).length / cites.length : null,
    refusalAccuracy: results.length
      ? (answerable.filter((r) => !r.error && !r.refused).length + unanswerable.filter(refusedOrEsc).length) / results.length
      : null,
    falseRefusalRate: answerable.length ? answerable.filter((r) => r.refused).length / answerable.length : null,
    falseAnswerRate: unanswerable.length ? unanswerable.filter((r) => !refusedOrEsc(r)).length / unanswerable.length : null,
    injectionResistance: injection.length ? injection.filter((r) => r.pass).length / injection.length : null,
    piiHandling: pii.length ? pii.filter((r) => r.pass).length / pii.length : null,
    languageMatch: mean(answerable.filter((r) => r.languageMatch !== undefined).map((r) => (r.languageMatch ? 1 : 0))),
    ops: {
      latencyP50: percentile(lat, 50),
      latencyP95: percentile(lat, 95),
      ttftP50: percentile(ttft, 50),
      ttftP95: percentile(ttft, 95),
      avgInputTokens: mean(inTok),
      avgOutputTokens: mean(outTok),
      costPerQueryUsd: mean(cost),
      hypotheticalGpt4oMiniPerQueryUsd: mean(hypo),
      failovers: ok.filter((r) => r.modelUsed && r.modelUsed !== getEnv().CHAT_MODEL).length,
      errors: results.filter((r) => r.error).length,
      judgeErrors: results.filter((r) => r.judgeError).length,
    },
    passRate: results.length ? results.filter((r) => r.pass).length / results.length : null,
    byType,
  };
}

type Summary = ReturnType<typeof summarize>;

function renderMarkdown(meta: Record<string, string>, s: Summary, results: ItemResult[], k: number): string {
  const lines: string[] = [];
  lines.push(`# Eval report${meta.tag ? ` — ${meta.tag}` : ""}`, "");
  lines.push(...Object.entries(meta).filter(([key]) => key !== "tag").map(([key, v]) => `- **${key}:** ${v}`), "");
  lines.push("## Summary", "", "| Metric | Value |", "| --- | --- |");
  const row = (name: string, v: string) => lines.push(`| ${name} | ${v} |`);
  row("Overall pass rate", `${pct(s.passRate)} (${results.filter((r) => r.pass).length}/${s.n})`);
  row(`Retrieval Recall@${k}`, `${pct(s.retrieval.recall)} (n=${s.retrieval.n})`);
  row("Retrieval MRR", num(s.retrieval.mrr, 3));
  row(`Chunk Recall@3 / @${k} (answer-bearing chunk)`, `${pct(s.retrieval.chunkRecall3)} / ${pct(s.retrieval.chunkRecall)} (n=${s.retrieval.chunkN})`);
  row("Chunk MRR", num(s.retrieval.chunkMrr, 3));
  row("Answer correctness (LLM judge)", `${pct(s.correctness)} (n=${s.judgedCount})`);
  row("Faithfulness / groundedness", pct(s.faithfulness));
  row("Citation validity", pct(s.citationValidity));
  row("Answers with citations", pct(s.citationCoverage));
  row("Refusal accuracy", pct(s.refusalAccuracy));
  row("False-refusal rate (answerable refused)", pct(s.falseRefusalRate));
  row("False-answer rate (unanswerable answered)", pct(s.falseAnswerRate));
  row("Injection resistance", pct(s.injectionResistance));
  row("PII handling", pct(s.piiHandling));
  row("Answer language matches question", pct(s.languageMatch));
  lines.push("", "## Operations", "", "| Metric | Value |", "| --- | --- |");
  const o = s.ops;
  row("Latency p50 / p95", `${num((o.latencyP50 ?? NaN) / 1000, 1)} s / ${num((o.latencyP95 ?? NaN) / 1000, 1)} s`);
  row("TTFT p50 / p95", `${num((o.ttftP50 ?? NaN) / 1000, 1)} s / ${num((o.ttftP95 ?? NaN) / 1000, 1)} s`);
  row("Avg tokens in / out", `${num(o.avgInputTokens, 0)} / ${num(o.avgOutputTokens, 0)}`);
  row("Cost per query (price table, free tier = 0)", `$${num(o.costPerQueryUsd, 5)}`);
  row("Same tokens at gpt-4o-mini list price", `$${num(o.hypotheticalGpt4oMiniPerQueryUsd, 5)}`);
  row("Failovers to the fallback model", String(o.failovers));
  row("Agent errors / judge errors", `${o.errors} / ${o.judgeErrors}`);

  lines.push("", "## By question type", "", `| Type | Pass | Recall@${k} | MRR |`, "| --- | --- | --- | --- |");
  for (const [type, v] of Object.entries(s.byType)) {
    const r = s.retrieval.byType[type];
    lines.push(`| ${type} | ${v.pass}/${v.n} | ${r ? pct(r.recall) : "–"} | ${r ? num(r.mrr, 3) : "–"} |`);
  }

  const failed = results.filter((r) => !r.pass);
  lines.push("", `## Failures (${failed.length})`, "");
  if (!failed.length) lines.push("None.");
  for (const r of failed) {
    lines.push(`### ${r.item.id} · ${r.item.type} · ${r.item.persona} · ${r.item.lang}`);
    lines.push(`- **Q:** ${r.item.question}`, `- **Expected:** ${r.item.expected_answer}`);
    lines.push(`- **Answer:** ${(r.answer ?? "(none)").replace(/\s+/g, " ").slice(0, 400)}`);
    lines.push(`- **Why:** ${r.failures.join("; ") || "n/a"}`, "");
  }
  return lines.join("\n") + "\n";
}

// ---- main -----------------------------------------------------------------------------------
const item_has_evidence = (item: GoldenItem) => !!item.evidence?.length;

function loadStress(): GoldenItem[] {
  return fs
    .readFileSync(path.join(import.meta.dirname, "retrieval-stress.jsonl"), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as GoldenItem);
}

async function retrievalOnly(items: GoldenItem[], k: number) {
  const modes: RetrievalMode[] = ["vector", "hybrid"];
  const sets: Record<string, GoldenItem[]> = {
    [`golden set (${items.length} questions)`]: items,
    "keyword stress set (exact policy terms)": loadStress(),
  };
  const outcomes: Record<string, Record<string, RetrievalOutcome[]>> = {};
  const lines = [`# Retrieval-only comparison (k=${k})`, ""];
  for (const [setName, set] of Object.entries(sets)) {
    outcomes[setName] = {};
    for (const mode of modes) {
      outcomes[setName][mode] = [];
      for (const item of set) outcomes[setName][mode].push(await probeRetrieval(item, mode));
    }
    lines.push(`## ${setName}`, "", `| Mode | Doc Recall@${k} | Doc MRR | Chunk Recall@1 | Chunk Recall@3 | Chunk Recall@${k} | Chunk MRR |`, "| --- | --- | --- | --- | --- | --- | --- |");
    for (const mode of modes) {
      const m = retrievalMetrics(set.map((item, i) => ({ item, retrieval: outcomes[setName][mode][i] })), k);
      lines.push(`| ${mode} | ${pct(m.recall)} | ${num(m.mrr, 3)} | ${pct(m.chunkRecall1)} | ${pct(m.chunkRecall3)} | ${pct(m.chunkRecall)} | ${num(m.chunkMrr, 3)} |`);
    }
    lines.push("");
    // items where the modes disagree or the answer-bearing chunk was missed
    const diffs = set
      .map((item, i) => ({ item, v: outcomes[setName].vector[i].chunkRank, h: outcomes[setName].hybrid[i].chunkRank }))
      .filter((d) => item_has_evidence(d.item) && (d.v !== d.h || d.v === null));
    if (diffs.length) {
      lines.push("Chunk rank differences / misses (vector → hybrid):", "");
      for (const d of diffs) lines.push(`- ${d.item.id} "${d.item.question}": ${d.v ?? "miss"} → ${d.h ?? "miss"}`);
      lines.push("");
    }
  }
  const goldenKey = Object.keys(sets)[0];
  const hybridOutcomes = outcomes[goldenKey].hybrid;
  const outcomesHybrid = { hybrid: hybridOutcomes };
  lines.push("", "## Threshold sweep (hybrid): error rates for the \"found\" decision", "", "| max distance | min RRF | false refusals | false answers | accuracy |", "| --- | --- | --- | --- | --- |");
  const probes: RetrievalProbe[] = items.map((item, i) => ({
    answerable: item.type !== "unanswerable",
    bestVectorDistance: outcomesHybrid.hybrid[i].bestVectorDistance,
    topScore: outcomesHybrid.hybrid[i].topScore,
  }));
  const rows = sweepThresholds(probes, [0.26, 0.28, 0.3, 0.32, 0.33, 0.34, 0.36, 0.4, 0.45], [0, 0.02]);
  for (const r of rows) {
    lines.push(`| ${r.maxDistance} | ${r.minRelevance} | ${pct(r.falseRefusalRate)} | ${pct(r.falseAnswerRate)} | ${pct(r.accuracy)} |`);
  }
  const best = Math.max(...rows.map((r) => r.accuracy));
  const ties = rows.filter((r) => r.accuracy === best && r.minRelevance === 0);
  const pick = ties[Math.floor(ties.length / 2)];
  lines.push("", `Best accuracy ${pct(best)} for max distance in [${ties.map((t) => t.maxDistance).join(", ")}] → suggested MAX_VECTOR_DISTANCE=${pick?.maxDistance}`);
  const dists = items.map((it, i) => ({ type: it.type, d: outcomesHybrid.hybrid[i].bestVectorDistance }));
  const range = (pred: (t: string) => boolean) => {
    const ds = dists.filter((x) => pred(x.type) && x.d != null).map((x) => x.d!);
    return ds.length ? `${Math.min(...ds).toFixed(3)} – ${Math.max(...ds).toFixed(3)}` : "n/a";
  };
  lines.push("", `Best vector distance: answerable ${range((t) => t !== "unanswerable")}, unanswerable ${range((t) => t === "unanswerable")}`);
  const out = lines.join("\n") + "\n";
  console.log(out);
  fs.writeFileSync(path.join(import.meta.dirname, "reports", "retrieval-latest.md"), out);
}

async function main() {
  const env = getEnv();
  const k = env.TOP_K;
  let items = loadGolden();
  const subset = opt("subset") ? Number(opt("subset")) : undefined;
  if (subset) items = stratifiedSubset(items, subset);
  console.log(`Eval: ${items.length} questions, mode=${env.RETRIEVAL_MODE}, chat=${env.CHAT_MODEL} (+${env.CHAT_MODEL_FALLBACK}), judge=${env.JUDGE_MODEL}`);

  if (flag("retrieval-only")) return retrievalOnly(items, k);

  console.log("Retrieval probes…");
  const retrievals: RetrievalOutcome[] = [];
  for (const item of items) retrievals.push(await probeRetrieval(item, env.RETRIEVAL_MODE));

  const concurrency = Number(opt("concurrency") ?? 3);
  const t0 = Date.now();
  let done = 0;
  const results = await pool(items, concurrency, async (item, i) => {
    const r = await evaluateItem(item, retrievals[i]);
    console.log(`[${++done}/${items.length}] ${item.id} ${item.type.padEnd(12)} ${r.pass ? "PASS" : "FAIL"}${r.failures.length ? "  " + r.failures[0].slice(0, 90) : ""}`);
    return r;
  });
  const wallSeconds = Math.round((Date.now() - t0) / 1000);

  const summary = summarize(results, k);
  const tag = opt("tag");
  const meta: Record<string, string> = {
    ...(tag ? { tag } : {}),
    Date: new Date().toISOString(),
    "Retrieval mode": env.RETRIEVAL_MODE,
    "Chat model": `${env.CHAT_MODEL} (fallback ${env.CHAT_MODEL_FALLBACK})`,
    "Judge model": env.JUDGE_MODEL,
    "Prompt version": PROMPT_VERSION,
    "Thresholds": `MAX_VECTOR_DISTANCE=${env.MAX_VECTOR_DISTANCE}, MIN_RELEVANCE=${env.MIN_RELEVANCE}, TOP_K=${env.TOP_K}`,
    Questions: `${items.length}${subset ? ` (stratified subset of ${subset})` : " (full golden set)"}`,
    "Wall time": `${wallSeconds} s (concurrency ${concurrency}, free-tier rate limits apply)`,
  };
  const md = renderMarkdown(meta, summary, results, k);

  const dir = path.join(import.meta.dirname, "reports");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const base = `${stamp}${tag ? `-${tag}` : ""}`;
  fs.writeFileSync(path.join(dir, `${base}.md`), md);
  fs.writeFileSync(path.join(dir, `${base}.json`), JSON.stringify({ meta, summary, results }, null, 2));
  if (!subset && tag !== "nightly") fs.writeFileSync(path.join(dir, "latest.md"), md);
  console.log("\n" + md.split("## By question type")[0]);
  console.log(`Report: eval/reports/${base}.md`);

  const minCorrect = opt("min-correctness") ? Number(opt("min-correctness")) : undefined;
  const minRefusal = opt("min-refusal") ? Number(opt("min-refusal")) : undefined;
  const problems: string[] = [];
  if (minCorrect !== undefined && (summary.correctness ?? 0) < minCorrect) problems.push(`correctness ${pct(summary.correctness)} < ${pct(minCorrect)}`);
  if (minRefusal !== undefined && (summary.refusalAccuracy ?? 0) < minRefusal) problems.push(`refusal accuracy ${pct(summary.refusalAccuracy)} < ${pct(minRefusal)}`);
  if (problems.length) {
    console.error(`QUALITY GATE FAILED: ${problems.join("; ")}`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
