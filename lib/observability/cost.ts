/**
 * USD per 1M tokens. Configurable by editing this table (or adding a model).
 * Gemini free-tier models cost 0 — the daily budget guard then effectively caps nothing, so the
 * request rate limit is what protects the demo. Unknown models are treated as free.
 */
export const CHAT_PRICES: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash": { input: 0, output: 0 },
  "gemini-3.5-flash": { input: 0, output: 0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
};

export const EMBEDDING_PRICES: Record<string, number> = {
  "gemini-embedding-001": 0,
  "text-embedding-3-small": 0.02,
  "text-embedding-3-large": 0.13,
};

export function estimateEmbeddingCostUsd(model: string, tokens: number): number {
  return ((EMBEDDING_PRICES[model] ?? 0) * tokens) / 1_000_000;
}
