import { config } from "dotenv";

config({ path: ".env.local" });
config();

import { generateText, isStepCount, tool } from "ai";
import { z } from "zod";
import { chatProviderOptions, getChatModel, getJudgeModel } from "../lib/ai/models";
import { getEnv } from "../lib/env";
import { embedQuery } from "../lib/rag/embed";

/**
 * Smoke-tests the configured providers in a few seconds: chat model (with a forced tool call, which is
 * what the agent relies on), judge model and embeddings. Run it before a long eval: `pnpm check:llm`
 */
async function step<T>(name: string, fn: () => Promise<T>) {
  const t = performance.now();
  try {
    const result = await fn();
    console.log(`  ok    ${name} (${((performance.now() - t) / 1000).toFixed(1)} s)${result ? ` — ${result}` : ""}`);
    return true;
  } catch (err) {
    console.log(`  FAIL  ${name}: ${String(err).replace(/\s+/g, " ").slice(0, 260)}`);
    return false;
  }
}

async function main() {
  const env = getEnv();
  console.log(`provider=${env.CHAT_PROVIDER} chat=${env.CHAT_MODEL} fallback=${env.CHAT_MODEL_FALLBACK} judge=${env.JUDGE_MODEL} embeddings=${env.EMBEDDING_PROVIDER}`);
  const results: boolean[] = [];

  results.push(
    await step("chat model answers", async () => {
      const r = await generateText({
        model: getChatModel(env.CHAT_MODEL, false),
        prompt: "Reply with exactly: ok",
        providerOptions: chatProviderOptions(),
        maxRetries: 0,
      });
      return r.text.trim().slice(0, 40);
    }),
  );

  results.push(
    await step("chat model calls a tool (forced) and then answers", async () => {
      const r = await generateText({
        model: getChatModel(env.CHAT_MODEL, false),
        instructions: "Use the tool, then state the number it returned.",
        prompt: "How many vacation days are there?",
        tools: {
          lookup: tool({
            description: "Looks up a number",
            inputSchema: z.object({ query: z.string() }),
            execute: async () => ({ days: 30 }),
          }),
        },
        prepareStep: ({ stepNumber }) => (stepNumber === 0 ? { toolChoice: { type: "tool" as const, toolName: "lookup" as const } } : {}),
        stopWhen: isStepCount(3),
        providerOptions: chatProviderOptions(),
        maxRetries: 0,
      });
      if (!r.text.includes("30")) throw new Error(`tool result not used: "${r.text.slice(0, 80)}"`);
      return `${r.steps.length} steps, answer "${r.text.trim().slice(0, 40)}"`;
    }),
  );

  results.push(
    await step("judge model returns structured output", async () => {
      const { judgeAnswer } = await import("../eval/judges");
      const v = await judgeAnswer(
        { question: "How many days?", persona: "all", expectedAnswer: "30 days", answer: "30 days [1]", sources: [{ n: 1, title: "T", section: "S", text: "Employees get 30 days." }] },
        1,
      );
      return `correct=${v.correct}, claims=${v.claims.length}`;
    }),
  );
  void getJudgeModel;

  results.push(
    await step("embeddings", async () => {
      const r = await embedQuery(`healthcheck ${Date.now()}`);
      return `${r.embeddings[0].length} dims`;
    }),
  );

  console.log(results.every(Boolean) ? "\nAll good." : "\nSome checks failed.");
  process.exitCode = results.every(Boolean) ? 0 : 1;
}

main();
