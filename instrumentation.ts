/**
 * OpenTelemetry for the AI SDK v7: every chat request becomes one trace (LLM generations with tokens
 * and cost, tool calls, and the custom `rag.retrieve` span). Spans are exported to Langfuse when keys
 * are configured; without keys the app still runs and trace ids are still valid.
 */
import type { LangfuseSpanProcessor } from "@langfuse/otel";

declare global {
  var __langfuseProcessor: LangfuseSpanProcessor | undefined;
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { registerOTel } = await import("@vercel/otel");
  const { registerTelemetry } = await import("ai");
  const { OpenTelemetry } = await import("@ai-sdk/otel");

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const spanProcessors = [];

  if (publicKey && secretKey) {
    const { LangfuseSpanProcessor } = await import("@langfuse/otel");
    const processor = new LangfuseSpanProcessor({
      publicKey,
      secretKey,
      baseUrl: process.env.LANGFUSE_BASEURL || undefined,
      // serverless functions freeze after the response: send spans right away
      exportMode: process.env.VERCEL ? "immediate" : "batched",
      // only AI SDK + RAG spans, not every Next.js internal span
      shouldExportSpan: ({ otelSpan }) =>
        otelSpan.instrumentationScope.name === "ai" ||
        otelSpan.instrumentationScope.name === "ask-hr" ||
        otelSpan.instrumentationScope.name.startsWith("@ai-sdk"),
    });
    globalThis.__langfuseProcessor = processor;
    spanProcessors.push(processor);
  }

  registerOTel({ serviceName: "ask-hr", spanProcessors });
  registerTelemetry(new OpenTelemetry());
}
