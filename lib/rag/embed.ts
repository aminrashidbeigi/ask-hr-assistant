import { google } from "@ai-sdk/google";
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

/** Seconds the provider asked us to wait ("Please retry in 44.8s"), if the error says so. */
export function retryAfterMs(err: unknown): number | undefined {
  const text = err instanceof Error ? `${err.message} ${JSON.stringify((err as { data?: unknown }).data ?? "")}` : String(err);
  const m = /retry in ([\d.]+)\s*s/i.exec(text);
  return m ? Math.ceil(parseFloat(m[1]) * 1000) + 1000 : undefined;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 6, baseMs = 500 }: { attempts?: number; baseMs?: number } = {},
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i === attempts - 1) break;
      // Honour the provider's own rate-limit hint (free tiers), else exponential backoff with jitter.
      const delay = retryAfterMs(err) ?? baseMs * 2 ** i + Math.random() * 100;
      if (delay > 5000) console.warn(`rate limited, waiting ${Math.round(delay / 1000)}s before retrying…`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

/** Some providers (Gemini) report no usable token count; fall back to our own estimate. */
function usageTokens(reported: number | undefined, values: string[]): number {
  return typeof reported === "number" && Number.isFinite(reported)
    ? reported
    : values.reduce((s, t) => s + estimateTokens(t), 0);
}

type TaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

function embeddingSetup(taskType: TaskType) {
  const env = getEnv();
  if (env.EMBEDDING_PROVIDER === "google") {
    if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is required for EMBEDDING_PROVIDER=google");
    }
    return {
      model: google.embedding(env.EMBEDDING_MODEL),
      // Gemini embeddings are Matryoshka-trained: ask for 1536 dims so the schema stays vector(1536).
      providerOptions: { google: { outputDimensionality: EMBEDDING_DIMS, taskType } },
    };
  }
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for EMBEDDING_PROVIDER=openai");
  return { model: openai.embedding(env.EMBEDDING_MODEL), providerOptions: undefined };
}

export async function embedTexts(texts: string[], batchSize = 64): Promise<EmbedResult> {
  if (getEnv().EMBEDDING_PROVIDER === "mock") {
    return {
      embeddings: texts.map((t) => mockEmbedding(t)),
      tokens: texts.reduce((s, t) => s + estimateTokens(t), 0),
    };
  }
  const { model, providerOptions } = embeddingSetup("RETRIEVAL_DOCUMENT");
  const embeddings: number[][] = [];
  let tokens = 0;
  for (let i = 0; i < texts.length; i += batchSize) {
    const values = texts.slice(i, i + batchSize);
    const res = await withRetry(() => embedMany({ model, values, providerOptions, maxRetries: 0 }));
    embeddings.push(...res.embeddings);
    tokens += usageTokens(res.usage.tokens, values);
  }
  return { embeddings, tokens };
}

export async function embedQuery(text: string): Promise<EmbedResult> {
  if (getEnv().EMBEDDING_PROVIDER === "mock") {
    return { embeddings: [mockEmbedding(text)], tokens: estimateTokens(text) };
  }
  const { model, providerOptions } = embeddingSetup("RETRIEVAL_QUERY");
  const res = await withRetry(() => embed({ model, value: text, providerOptions, maxRetries: 0 }), {
    attempts: 3,
  });
  return { embeddings: [res.embedding], tokens: usageTokens(res.usage.tokens, [text]) };
}
