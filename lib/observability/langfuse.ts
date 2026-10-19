import { LangfuseClient } from "@langfuse/client";
import { getEnv } from "@/lib/env";
import { logger } from "./logger";

const globalForLangfuse = globalThis as unknown as { __langfuse?: LangfuseClient | null };

/** null when Langfuse keys are not configured (tracing/scores are then skipped). */
export function getLangfuse(): LangfuseClient | null {
  if (globalForLangfuse.__langfuse !== undefined) return globalForLangfuse.__langfuse;
  const env = getEnv();
  globalForLangfuse.__langfuse =
    env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY
      ? new LangfuseClient({
          publicKey: env.LANGFUSE_PUBLIC_KEY,
          secretKey: env.LANGFUSE_SECRET_KEY,
          baseUrl: env.LANGFUSE_BASEURL,
        })
      : null;
  return globalForLangfuse.__langfuse;
}

/** Attach a score (e.g. user feedback ±1) to a trace. Never throws. */
export async function sendTraceScore(params: {
  traceId: string;
  name: string;
  value: number;
  comment?: string;
}): Promise<boolean> {
  const client = getLangfuse();
  if (!client) return false;
  try {
    client.score.create(params);
    await client.score.flush();
    return true;
  } catch (err) {
    logger.warn({ err: String(err) }, "failed to send langfuse score");
    return false;
  }
}
