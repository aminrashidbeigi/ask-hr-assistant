import { isStepCount, streamText, type ModelMessage } from "ai";
import { chatProviderOptions, getChatModel } from "@/lib/ai/models";
import { getEnv } from "@/lib/env";
import type { Persona } from "@/lib/rag/fusion";
import { buildInstructions, PROMPT_VERSION } from "./prompt";
import { createCollector, createTools, type RequestCollector } from "./tools";
import type { Source } from "./types";

export interface AgentRunState {
  /** ms from `started` to the first streamed answer token */
  ttftMs?: number;
  /** the model that actually served the call (differs from CHAT_MODEL after a failover) */
  modelUsed: string;
}

export interface AgentEnd {
  answer: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface AgentRunOptions {
  messages: ModelMessage[];
  persona: Persona;
  sessionId?: string;
  /** reference point for TTFT; defaults to the moment the run starts */
  started?: number;
  onSources?: (sources: Source[]) => void;
  onEnd?: (end: AgentEnd) => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
}

/**
 * The agent loop shared by the chat route and the eval harness: system prompt, the two tools,
 * at most 4 steps, low temperature, telemetry metadata.
 */
export function runAgent(opts: AgentRunOptions) {
  const env = getEnv();
  const started = opts.started ?? performance.now();
  const collector: RequestCollector = createCollector();
  const state: AgentRunState = { modelUsed: env.CHAT_MODEL };

  const tools = createTools({ persona: opts.persona, collector, onSources: opts.onSources });

  const result = streamText({
    model: getChatModel(env.CHAT_MODEL, true, (id) => {
      state.modelUsed = id;
    }),
    instructions: buildInstructions({ persona: opts.persona }),
    messages: opts.messages,
    tools,
    stopWhen: isStepCount(4),
    // Retrieval first, always: the model may not answer from its own knowledge (grounding guarantee).
    prepareStep: ({ stepNumber }) =>
      stepNumber === 0 ? { toolChoice: { type: "tool" as const, toolName: "searchPolicies" as const } } : {},
    temperature: 0.1,
    providerOptions: chatProviderOptions(),
    runtimeContext: {
      persona: opts.persona,
      promptVersion: PROMPT_VERSION,
      sessionId: opts.sessionId ?? "none",
    },
    telemetry: {
      functionId: "ask-hr-chat",
      includeRuntimeContext: { persona: true, promptVersion: true, sessionId: true },
    },
    onChunk: ({ chunk }) => {
      if (state.ttftMs === undefined && chunk.type === "text-delta") {
        state.ttftMs = Math.round(performance.now() - started);
      }
    },
    onEnd: async (event) => {
      await opts.onEnd?.({
        answer: event.finalStep.text,
        inputTokens: event.usage.inputTokens,
        outputTokens: event.usage.outputTokens,
      });
    },
    onError: async ({ error }) => {
      await opts.onError?.(error);
    },
  });

  return { result, collector, state };
}
