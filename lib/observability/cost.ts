/** USD per 1M tokens. Configurable by editing this table (or adding a model). */
export const CHAT_PRICES: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
};

export const EMBEDDING_PRICES: Record<string, number> = {
  "text-embedding-3-small": 0.02,
  "text-embedding-3-large": 0.13,
};

export function estimateEmbeddingCostUsd(model: string, tokens: number): number {
  return ((EMBEDDING_PRICES[model] ?? 0) * tokens) / 1_000_000;
}
