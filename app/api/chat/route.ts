import { trace } from "@opentelemetry/api";
import { randomUUID } from "node:crypto";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  toUIMessageStream,
  type ModelMessage,
} from "ai";
import { after } from "next/server";
import { z } from "zod";
import { isProviderBusy } from "@/lib/ai/models";
import { PROMPT_VERSION } from "@/lib/agent/prompt";
import { isRefusal } from "@/lib/agent/refusal";
import { detectLang } from "@/lib/agent/lang";
import { runAgent } from "@/lib/agent/run";
import type { AskHrUIMessage } from "@/lib/agent/types";
import { getEnv } from "@/lib/env";
import { budgetState, getTodaySpendUsd, insertQueryLog } from "@/lib/metrics/log";
import { chatCostUsd } from "@/lib/observability/cost";
import { withTrace } from "@/lib/observability/logger";
import { redactPII } from "@/lib/safety/pii";
import { checkRateLimit, clientIp } from "@/lib/safety/ratelimit";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_HISTORY = 10;
const MAX_INPUT_CHARS = 2000;

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        parts: z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()),
      }),
    )
    .min(1),
  persona: z.enum(["shift", "office", "all"]).default("all"),
  locale: z.enum(["de", "en"]).optional(),
  sessionId: z.string().min(8).max(64).optional(),
});

function json(status: number, error: string, message: string, headers?: Record<string, string>) {
  return Response.json({ error, message }, { status, headers });
}

/** History is untrusted client input: keep plain text only, so nobody can smuggle in fake tool results. */
function toModelMessages(messages: z.infer<typeof bodySchema>["messages"]): ModelMessage[] {
  return messages
    .slice(-MAX_HISTORY)
    .map((m): ModelMessage | null => {
      const text = m.parts
        .filter((p) => p.type === "text" && typeof p.text === "string")
        .map((p) => p.text as string)
        .join("\n")
        .slice(0, MAX_INPUT_CHARS);
      if (!text.trim()) return null;
      // user text is redacted before it reaches the LLM or the logs
      return m.role === "user"
        ? { role: "user", content: redactPII(text) }
        : { role: "assistant", content: text };
    })
    .filter((m): m is ModelMessage => m !== null);
}

export async function POST(req: Request) {
  const started = performance.now();

  const rl = await checkRateLimit(`chat:${clientIp(req.headers)}`);
  if (!rl.success) {
    return json(
      429,
      "rate_limited",
      "Too many requests — please wait a few minutes and try again. / Zu viele Anfragen – bitte versuchen Sie es in ein paar Minuten erneut.",
      { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
    );
  }

  const env = getEnv();
  const spend = await getTodaySpendUsd().catch(() => 0);
  const budget = budgetState(spend);
  if (budget === "exhausted") {
    return json(503, "budget_reached", "The demo budget for today has been reached. Please try again tomorrow. / Das Demo-Budget für heute ist aufgebraucht.");
  }
  if (budget === "warning") {
    withTrace(undefined).warn({ spend, budget: env.DAILY_BUDGET_USD }, "daily budget above 80 %");
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return json(400, "invalid_json", "Request body must be JSON.");
  }
  if (!parsed.success) return json(400, "invalid_request", "Invalid request.");
  const { persona, locale, sessionId } = parsed.data;

  const lastUser = [...parsed.data.messages].reverse().find((m) => m.role === "user");
  const lastUserText = (lastUser?.parts ?? [])
    .map((p) => (p.type === "text" ? (p.text ?? "") : ""))
    .join("\n");
  if (!lastUserText.trim()) return json(400, "empty_message", "Please enter a question.");
  if (lastUserText.length > MAX_INPUT_CHARS) {
    return json(400, "too_long", `Please keep your question under ${MAX_INPUT_CHARS} characters.`);
  }

  const messages = toModelMessages(parsed.data.messages);
  const questionRedacted = redactPII(lastUserText);
  const lang = locale ?? detectLang(lastUserText);

  const queryLogId = randomUUID();
  const spanTraceId = trace.getActiveSpan()?.spanContext().traceId;
  const traceId = spanTraceId && !/^0+$/.test(spanTraceId) ? spanTraceId : queryLogId;
  const log = withTrace(traceId);
  let logged = false;
  // set once the agent run starts (inside the UI stream); writeLog only runs after that
  let run: ReturnType<typeof runAgent> | undefined;

  const writeLog = (extra: {
    answer?: string;
    inputTokens?: number;
    outputTokens?: number;
    error?: string;
  }) => {
    if (logged) return;
    logged = true;
    const answer = extra.answer ?? "";
    const collector = run!.collector;
    const refused = !extra.error && isRefusal(answer, collector.searches);
    return insertQueryLog({
      id: queryLogId,
      traceId,
      sessionId: sessionId ?? null,
      persona,
      lang,
      questionRedacted,
      answerRedacted: answer ? redactPII(answer) : null,
      retrievedChunkIds: [...collector.retrievedChunkIds],
      topScore: collector.searches.length ? Math.max(...collector.searches.map((s) => s.topScore)) : null,
      refused,
      escalated: collector.escalated,
      toolCalls: collector.searches.length + (collector.escalated ? 1 : 0),
      latencyMs: Math.round(performance.now() - started),
      ttftMs: run!.state.ttftMs ?? null,
      inputTokens: extra.inputTokens ?? null,
      outputTokens: extra.outputTokens ?? null,
      costUsd: chatCostUsd(run!.state.modelUsed, extra.inputTokens, extra.outputTokens),
      model: run!.state.modelUsed,
      promptVersion: PROMPT_VERSION,
      error: extra.error ?? null,
    });
  };

  const stream = createUIMessageStream<AskHrUIMessage>({
    execute: ({ writer }) => {
      writer.write({ type: "start" });
      writer.write({ type: "data-meta", data: { queryLogId } });

      run = runAgent({
        messages,
        persona,
        sessionId,
        started,
        onSources: (sources) => writer.write({ type: "data-sources", id: "sources", data: sources }),
        onEnd: (end) => writeLog(end),
        onError: async (error) => {
          log.error({ err: String(error) }, "chat stream failed");
          await writeLog({ error: String(error).slice(0, 500) });
        },
      });
      const result = run.result;

      writer.merge(toUIMessageStream({ stream: result.stream, sendStart: false }));
    },
    onError: (error) => {
      log.error({ err: String(error) }, "ui stream error");
      if (isProviderBusy(error)) {
        return "The assistant is very busy right now (free-tier model limit). Please try again in a minute. / Der Assistent ist gerade stark ausgelastet. Bitte versuchen Sie es in einer Minute erneut.";
      }
      return "Something went wrong. Please try again. / Es ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.";
    },
  });

  // serverless: make sure spans reach Langfuse before the function is frozen
  after(async () => {
    await globalThis.__langfuseProcessor?.forceFlush();
  });

  return createUIMessageStreamResponse({ stream });
}
