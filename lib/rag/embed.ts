import { openai } from "@ai-sdk/openai";
import { embed, embedMany } from "ai";
import { EMBEDDING_DIMS } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { sha256 } from "./hash";
import { estimateTokens } from "./chunker";

export interface EmbedResult {
  embeddings: number[][];
  tokens: number;
}

/**
 * Deterministic fake embeddings for CI and unit tests (EMBEDDING_PROVIDER=mock).
 * Feature hashing of word unigrams/bigrams into a unit vector, so texts sharing words are close —
 * enough for retriever tests to be meaningful without an API key.
 */
export function mockEmbedding(text: string, dims = EMBEDDING_DIMS): number[] {
  const vec = new Array<number>(dims).fill(0);
  const words = text.toLowerCase().match(/[\p{L}\p{N}§%]+/gu) ?? [];
  const add = (token: string, weight: number) => {
    const h = sha256(token);
    const idx = parseInt(h.slice(0, 8), 16) % dims;
    const sign = parseInt(h.slice(8, 10), 16) % 2 === 0 ? 1 : -1;
    vec[idx] += sign * weight;
  };
  words.forEach((w, i) => {
    add(w, 1);
    if (i > 0) add(`${words[i - 1]} ${w}`, 0.5);
  });
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 5, baseMs = 500 }: { attempts?: number; baseMs?: number } = {},
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i === attempts - 1) break;
      const delay = baseMs * 2 ** i + Math.random() * 100;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

function embeddingModel() {
  const env = getEnv();
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for EMBEDDING_PROVIDER=openai");
  return openai.embedding(env.EMBEDDING_MODEL);
}

export async function embedTexts(texts: string[], batchSize = 64): Promise<EmbedResult> {
  const env = getEnv();
  if (env.EMBEDDING_PROVIDER === "mock") {
    return {
      embeddings: texts.map((t) => mockEmbedding(t)),
      tokens: texts.reduce((s, t) => s + estimateTokens(t), 0),
    };
  }
  const model = embeddingModel();
  const embeddings: number[][] = [];
  let tokens = 0;
  for (let i = 0; i < texts.length; i += batchSize) {
    const values = texts.slice(i, i + batchSize);
    const res = await withRetry(() => embedMany({ model, values, maxRetries: 0 }));
    embeddings.push(...res.embeddings);
    tokens += res.usage.tokens;
  }
  return { embeddings, tokens };
}

export async function embedQuery(text: string): Promise<EmbedResult> {
  const env = getEnv();
  if (env.EMBEDDING_PROVIDER === "mock") {
    return { embeddings: [mockEmbedding(text)], tokens: estimateTokens(text) };
  }
  const model = embeddingModel();
  const res = await withRetry(() => embed({ model, value: text, maxRetries: 0 }), { attempts: 3 });
  return { embeddings: [res.embedding], tokens: res.usage.tokens };
}
