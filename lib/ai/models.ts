import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { wrapLanguageModel, type LanguageModel, type LanguageModelMiddleware } from "ai";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/observability/logger";

/** Provider quota / overload errors (HTTP 429 / 503) — worth failing over, and shown as "busy". */
export function isProviderBusy(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message} ${JSON.stringify((error as { data?: unknown }).data ?? "")}` : String(error);
  return /quota|rate.?limit|RESOURCE_EXHAUSTED|\b429\b|\b503\b|high demand|overloaded|UNAVAILABLE/i.test(text);
}

/**
 * Gemini models "think" before answering, which adds seconds of latency. For a retrieval-grounded
 * assistant that is wasted time, so keep thinking minimal (3.x models) or off (2.5 models).
 * Applies to Google models only.
 */
export function googleThinkingOptions(modelId: string) {
  if (modelId.startsWith("gemini-3")) {
    return { google: { thinkingConfig: { thinkingLevel: "minimal" as const } } };
  }
  if (modelId.startsWith("gemini-2.5")) {
    return { google: { thinkingConfig: { thinkingBudget: 0 } } };
  }
  return undefined;
}

export function chatProviderOptions(modelId = getEnv().CHAT_MODEL) {
  return getEnv().CHAT_PROVIDER === "google" ? googleThinkingOptions(modelId) : undefined;
}

function baseModel(modelId: string) {
  const env = getEnv();
  if (env.CHAT_PROVIDER === "openai") {
    if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for CHAT_PROVIDER=openai");
    return openai(modelId);
  }
  if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is required for CHAT_PROVIDER=google");
  }
  return google(modelId);
}

/**
 * Free-tier quotas are per model (e.g. 5 requests/min for 2.5-flash, 15 for 3.5-flash-lite), so when
 * the primary model answers with a quota/overload error the same call is retried on the fallback.
 * Fast model while there is quota, slower model instead of an error when there is not.
 */
function failover(fallbackId: string, onFailover?: (modelId: string) => void): LanguageModelMiddleware {
  const fallback = baseModel(fallbackId);
  const forFallback = <P extends { providerOptions?: unknown }>(params: P): P => ({
    ...params,
    providerOptions: chatProviderOptions(fallbackId) as P["providerOptions"],
  });
  return {
    wrapStream: async ({ doStream, params }) => {
      try {
        return await doStream();
      } catch (err) {
        if (!isProviderBusy(err)) throw err;
        logger.warn({ fallback: fallbackId }, "primary model busy, failing over");
        onFailover?.(fallbackId);
        return fallback.doStream(forFallback(params));
      }
    },
    wrapGenerate: async ({ doGenerate, params }) => {
      try {
        return await doGenerate();
      } catch (err) {
        if (!isProviderBusy(err)) throw err;
        logger.warn({ fallback: fallbackId }, "primary model busy, failing over");
        onFailover?.(fallbackId);
        return fallback.doGenerate(forFallback(params));
      }
    },
  };
}

/** Provider-agnostic chat model: CHAT_PROVIDER + CHAT_MODEL, with optional CHAT_MODEL_FALLBACK. */
export function getChatModel(
  modelId = getEnv().CHAT_MODEL,
  withFallback = true,
  /** called with the fallback model id when a call failed over (for logging the model actually used) */
  onFailover?: (modelId: string) => void,
): LanguageModel {
  const env = getEnv();
  const primary = baseModel(modelId);
  const fallbackId = env.CHAT_MODEL_FALLBACK;
  if (!withFallback || fallbackId === "none" || fallbackId === modelId) return primary;
  return wrapLanguageModel({ model: primary, middleware: failover(fallbackId, onFailover) });
}

/** The judge uses its own model (separate quota pool) and no failover, so scores stay comparable. */
export function getJudgeModel(): LanguageModel {
  return getChatModel(getEnv().JUDGE_MODEL, false);
}
