/** Pure metric helpers for the eval harness (no I/O, unit-tested). */

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export { parseCitationNumbers as parseCitations } from "../lib/agent/citations";
import { parseCitationNumbers as parseCitations } from "../lib/agent/citations";

export interface CitationCheck {
  total: number;
  valid: number;
  invalid: number[];
}

/**
 * A citation is valid when [n] refers to a source that was really returned, and (if the question has
 * expected documents) that source belongs to one of them.
 */
export function checkCitations(
  answer: string,
  sources: { n: number; policyId: string }[],
  expectedDocIds: string[],
): CitationCheck {
  const cited = parseCitations(answer);
  const invalid: number[] = [];
  let valid = 0;
  for (const n of cited) {
    const src = sources.find((s) => s.n === n);
    const ok = !!src && (expectedDocIds.length === 0 || expectedDocIds.includes(src.policyId));
    if (ok) valid++;
    else invalid.push(n);
  }
  return { total: cited.length, valid, invalid };
}

/** 1-based rank of the first retrieved chunk that belongs to an expected policy, or null. */
export function firstRelevantRank(retrievedPolicyIds: string[], expectedDocIds: string[]): number | null {
  const idx = retrievedPolicyIds.findIndex((id) => expectedDocIds.includes(id));
  return idx === -1 ? null : idx + 1;
}

export function recallAtK(ranks: (number | null)[], k: number): number | null {
  return ranks.length ? ranks.filter((r) => r !== null && r <= k).length / ranks.length : null;
}

export function mrr(ranks: (number | null)[]): number | null {
  return ranks.length ? ranks.reduce<number>((s, r) => s + (r ? 1 / r : 0), 0) / ranks.length : null;
}

export interface RetrievalProbe {
  answerable: boolean;
  bestVectorDistance: number | null;
  topScore: number;
}

export interface SweepRow {
  maxDistance: number;
  minRelevance: number;
  /** answerable questions wrongly treated as "nothing found" */
  falseRefusalRate: number;
  /** unanswerable questions wrongly treated as "found" */
  falseAnswerRate: number;
  accuracy: number;
}

/** Sweep the two "found" thresholds over retrieval-only probes and report the error rates. */
export function sweepThresholds(
  probes: RetrievalProbe[],
  distances: number[],
  relevances: number[],
): SweepRow[] {
  const answerable = probes.filter((p) => p.answerable);
  const unanswerable = probes.filter((p) => !p.answerable);
  const rows: SweepRow[] = [];
  for (const maxDistance of distances) {
    for (const minRelevance of relevances) {
      const found = (p: RetrievalProbe) =>
        p.bestVectorDistance !== null && p.bestVectorDistance <= maxDistance && p.topScore >= minRelevance;
      const falseRefusals = answerable.filter((p) => !found(p)).length;
      const falseAnswers = unanswerable.filter((p) => found(p)).length;
      rows.push({
        maxDistance,
        minRelevance,
        falseRefusalRate: answerable.length ? falseRefusals / answerable.length : 0,
        falseAnswerRate: unanswerable.length ? falseAnswers / unanswerable.length : 0,
        accuracy: probes.length ? (probes.length - falseRefusals - falseAnswers) / probes.length : 0,
      });
    }
  }
  return rows;
}

/** Stratified subset: round-robin over item types so a small subset still covers every type. */
export function stratifiedSubset<T extends { type: string }>(items: T[], n: number): T[] {
  if (n >= items.length) return items;
  const groups = new Map<string, T[]>();
  for (const it of items) groups.set(it.type, [...(groups.get(it.type) ?? []), it]);
  const queues = [...groups.values()];
  const out: T[] = [];
  while (out.length < n && queues.some((q) => q.length)) {
    for (const q of queues) {
      const next = q.shift();
      if (next && out.length < n) out.push(next);
    }
  }
  return items.filter((it) => out.includes(it));
}
