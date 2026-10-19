/** Pure retrieval helpers (no DB, no network) so they can be unit-tested. */

export type Persona = "shift" | "office" | "all";

export const RRF_K = 60;
/** Relative boost for chunks in the question's language (cross-lingual hits stay possible). */
export const LANG_BOOST = 1.1;

/** Audience values a persona may see. Persona "all" is unfiltered (null). */
export function audiencesFor(persona: Persona): string[] | null {
  return persona === "all" ? null : ["all", persona];
}

/** Defence in depth next to the SQL filter: can this persona see a chunk with this audience? */
export function isVisibleTo(audience: string[], persona: Persona): boolean {
  const allowed = audiencesFor(persona);
  return allowed === null || audience.some((a) => allowed.includes(a));
}

/**
 * Reciprocal Rank Fusion: score(id) = Σ 1 / (k + rank), rank starting at 1 in every list the id
 * appears in. Returns ids sorted by fused score, best first.
 */
export function rrfFuse(lists: string[][], k = RRF_K): { id: string; score: number }[] {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, i) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + i + 1)));
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

const STOPWORDS = new Set(
  (
    // EN
    "a an and are as at be by can do does for from how i if in is it me my of on or the to was what when where which who why will with you your " +
    // DE
    "als am an auf aus bei bin das dem den der des die ein eine einen einem einer es für hat ich ihr ihre im in ist mein meine mir mit nach oder sind um und von vor was wann warum welche wer wie wir wo zu zum zur"
  ).split(" "),
);

/**
 * Turns a natural-language question into an OR-ed prefix tsquery string for
 * to_tsquery('simple', …). Only letters/digits survive, so the result is safe to bind.
 * Returns null when nothing searchable is left.
 */
export function buildTsQuery(question: string): string | null {
  const words = question.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const terms = [...new Set(words.filter((w) => w.length > 1 && !STOPWORDS.has(w)))];
  if (!terms.length) return null;
  return terms.map((t) => (t.length >= 5 ? `${t}:*` : t)).join(" | ");
}

export function applyLangBoost<T extends { lang: string; score: number }>(
  items: T[],
  lang: string | undefined,
): T[] {
  if (!lang) return items;
  return items
    .map((it) => (it.lang === lang ? { ...it, score: it.score * LANG_BOOST } : it))
    .sort((a, b) => b.score - a.score);
}
