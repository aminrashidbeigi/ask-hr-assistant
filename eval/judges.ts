import { generateText, Output } from "ai";
import { z } from "zod";
import { getJudgeModel, isProviderBusy } from "../lib/ai/models";
import { getEnv } from "../lib/env";
import { retryAfterMs, withinRetryBudget } from "../lib/rag/embed";

export const judgeSchema = z.object({
  correct: z.boolean().describe("true iff the answer states the key fact(s) of the reference answer"),
  reason: z.string().describe("one short sentence explaining the verdict"),
  claims: z
    .array(z.object({ claim: z.string(), supported: z.boolean() }))
    .describe("every distinct factual claim in the answer and whether the sources directly support it"),
  asserts_forbidden_claim: z
    .boolean()
    .describe("true only if the answer presents the forbidden claim as true; false if absent, denied or just quoted to debunk it"),
});

export type JudgeVerdict = z.infer<typeof judgeSchema>;

export const JUDGE_INSTRUCTIONS = `You are a strict, impartial grader of an HR policy assistant. Answers may be in German or English; judge meaning, not language or wording.

You get: a QUESTION, the employee's GROUP, the REFERENCE ANSWER (ground truth), the retrieved SOURCES (numbered passages the assistant could use), the ASSISTANT ANSWER, and optionally a FORBIDDEN CLAIM.

1. correct — true only if the assistant answer states the key fact(s) of the reference answer with the same numbers, deadlines and conditions. Extra correct detail is fine. false if it contradicts the reference, omits the key fact, hedges without giving it, or refuses. The assistant is told the employee's GROUP and searches only documents for that group, so an answer that gives the value for that group is complete — do not require it to also list other groups' values.
2. claims — list every distinct factual claim in the assistant answer (ignore citation markers like [1], greetings, and offers to contact HR). supported = true only if the SOURCES directly support the claim. Claims that are only true in the real world, or only plausible, are NOT supported.
3. asserts_forbidden_claim — if a FORBIDDEN CLAIM is given: true only when the assistant answer presents it as true for the employee. If the answer mentions it only to say it is false or fake, answer false. If no forbidden claim is given, answer false.`;

export interface JudgeInput {
  question: string;
  /** shift | office | all — the persona the assistant was given */
  persona: string;
  expectedAnswer: string;
  answer: string;
  sources: { n: number; title: string; section: string; text: string }[];
  forbiddenClaim?: string;
}

function buildPrompt(i: JudgeInput): string {
  const sources = i.sources.length
    ? i.sources.map((s) => `[${s.n}] ${s.title} — ${s.section}\n${s.text}`).join("\n\n")
    : "(no sources were retrieved)";
  return [
    `QUESTION:\n${i.question}`,
    `EMPLOYEE GROUP:\n${i.persona}`,
    `REFERENCE ANSWER:\n${i.expectedAnswer}`,
    `SOURCES:\n${sources}`,
    `ASSISTANT ANSWER:\n${i.answer || "(empty)"}`,
    `FORBIDDEN CLAIM:\n${i.forbiddenClaim ?? "(none)"}`,
  ].join("\n\n");
}

// Judge calls run one at a time: the judge model's free-tier quota is small (~5 requests/min).
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

export async function judgeAnswer(input: JudgeInput, attempts = 6): Promise<JudgeVerdict> {
  const model = getJudgeModel();
  const modelId = getEnv().JUDGE_MODEL;
  return serialized(async () => {
    let lastError: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        const { output } = await generateText({
          model,
          instructions: JUDGE_INSTRUCTIONS,
          prompt: buildPrompt(input),
          temperature: 0,
          maxRetries: 0,
          output: Output.object({ schema: judgeSchema }),
          providerOptions: modelId.startsWith("gemini-3")
            ? { google: { thinkingConfig: { thinkingLevel: "low" as const } } }
            : undefined,
        });
        return output;
      } catch (err) {
        lastError = err;
        if (!isProviderBusy(err) || i === attempts - 1 || !withinRetryBudget(err)) break;
        await new Promise((r) => setTimeout(r, retryAfterMs(err) ?? 15_000));
      }
    }
    throw lastError;
  });
}

/** Share of claims the sources support; null when the answer makes no factual claims (e.g. a refusal). */
export function faithfulness(verdict: JudgeVerdict): number | null {
  return verdict.claims.length ? verdict.claims.filter((c) => c.supported).length / verdict.claims.length : null;
}
