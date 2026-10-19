import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { getEnv } from "@/lib/env";

/** Provider-agnostic chat model, selected by CHAT_PROVIDER + CHAT_MODEL. */
export function getChatModel(modelId = getEnv().CHAT_MODEL): LanguageModel {
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

export function getJudgeModel(): LanguageModel {
  return getChatModel(getEnv().JUDGE_MODEL);
}
