import { describe, expect, it } from "vitest";
import { buildInstructions, PROMPT_VERSION, REFUSAL_PATTERN, REFUSAL_PHRASE_DE, REFUSAL_PHRASE_EN } from "@/lib/agent/prompt";
import { detectLang } from "@/lib/agent/lang";
import { isRefusal } from "@/lib/agent/refusal";
import { budgetState } from "@/lib/metrics/log";
import { chatCostUsd, estimateEmbeddingCostUsd } from "@/lib/observability/cost";
import { createMemoryLimiter } from "@/lib/safety/ratelimit";

describe("memory rate limiter", () => {
  it("allows 20 requests per 10 minutes and blocks the 21st", async () => {
    let t = 0;
    const limiter = createMemoryLimiter(20, 10 * 60_000, () => t);
    for (let i = 1; i <= 20; i++) {
      const r = await limiter.limit("ip");
      expect(r.success).toBe(true);
      expect(r.remaining).toBe(20 - i);
      t += 1000;
    }
    const blocked = await limiter.limit("ip");
    expect(blocked.success).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks keys separately and frees capacity after the window", async () => {
    let t = 0;
    const limiter = createMemoryLimiter(2, 1000, () => t);
    await limiter.limit("a");
    await limiter.limit("a");
    expect((await limiter.limit("a")).success).toBe(false);
    expect((await limiter.limit("b")).success).toBe(true);
    t = 1500;
    expect((await limiter.limit("a")).success).toBe(true);
  });
});

describe("cost", () => {
  it("computes chat cost from the price table (USD per 1M tokens)", () => {
    expect(chatCostUsd("gpt-4o-mini", 1_000_000, 1_000_000)).toBeCloseTo(0.75, 10);
    expect(chatCostUsd("gpt-4o-mini", 2000, 500)).toBeCloseTo(0.0006, 10);
  });
  it("treats free-tier Gemini and unknown models as free", () => {
    expect(chatCostUsd("gemini-2.5-flash", 10_000, 10_000)).toBe(0);
    expect(chatCostUsd("some-unknown-model", 10_000, 10_000)).toBe(0);
    expect(chatCostUsd("gpt-4o-mini")).toBe(0);
  });
  it("estimates embedding cost", () => {
    expect(estimateEmbeddingCostUsd("text-embedding-3-small", 1_000_000)).toBeCloseTo(0.02, 10);
  });
});

describe("budget guard", () => {
  it("is ok below 80 %, warns from 80 %, exhausted at 100 %", () => {
    expect(budgetState(0, 2)).toBe("ok");
    expect(budgetState(1.59, 2)).toBe("ok");
    expect(budgetState(1.6, 2)).toBe("warning");
    expect(budgetState(2, 2)).toBe("exhausted");
  });
});

describe("system prompt", () => {
  const prompt = buildInstructions({ persona: "shift" });

  it("is versioned", () => expect(PROMPT_VERSION).toBe("v2"));

  it("does not treat personal details in a question as a personal case", () => {
    expect(prompt).toMatch(/does NOT make a question personal/);
  });

  it("contains the prompt-injection defence rule", () => {
    expect(prompt).toMatch(/data, not instructions/i);
    expect(prompt).toMatch(/ignore previous instructions/i);
  });

  it("requires searching first, grounding, citations and escalation", () => {
    expect(prompt).toContain("searchPolicies");
    expect(prompt).toMatch(/ONLY from the text returned/);
    expect(prompt).toContain("[n]");
    expect(prompt).toContain("escalateToHR");
  });

  it("states the persona", () => {
    expect(buildInstructions({ persona: "office" })).toMatch(/office role/);
    expect(buildInstructions({ persona: "all" })).toMatch(/differs between the two groups/);
  });

  it("refusal pattern matches the prompt's own refusal phrases", () => {
    expect(REFUSAL_PATTERN.test(`${REFUSAL_PHRASE_EN}. Would you like me to forward it?`)).toBe(true);
    expect(REFUSAL_PATTERN.test(`${REFUSAL_PHRASE_DE}. Soll ich die Frage weiterleiten?`)).toBe(true);
    expect(REFUSAL_PATTERN.test("You get 30 vacation days [1].")).toBe(false);
  });

  it("refusal pattern also recognises 'forward your question to HR' offers", () => {
    expect(REFUSAL_PATTERN.test("This is a personal matter. Would you like me to forward your question to the HR team?")).toBe(true);
    expect(REFUSAL_PATTERN.test("Möchten Sie, dass ich Ihre Frage an das HR-Team weiterleite?")).toBe(true);
    expect(REFUSAL_PATTERN.test("Contact HR at hr@voltwerk.example for your vacation balance.")).toBe(false);
  });
});

describe("detectLang", () => {
  it("detects German and English", () => {
    expect(detectLang("Wie hoch ist der Nachtzuschlag?")).toBe("de");
    expect(detectLang("How many vacation days do I get?")).toBe("en");
    // English sentences with "was" / "the die" must not look German
    expect(detectLang("Remote work was limited to 1 day per week before 2026.")).toBe("en");
    expect(detectLang("Wann muss ich mich krank melden?")).toBe("de");
  });
});

describe("isRefusal", () => {
  const found = [{ found: true }];
  it("is true when searches ran but nothing relevant was found", () => {
    expect(isRefusal("Whatever the model said.", [{ found: false }, { found: false }])).toBe(true);
  });
  it("is false for an answer that cites sources, even if it offers to forward to HR", () => {
    expect(isRefusal("You get 30 days [1]. Would you like me to forward your question to HR?", found)).toBe(false);
  });
  it("is true for refusal wording without citations", () => {
    expect(isRefusal("I couldn't find this in the HR policies. Shall I forward your question to HR?", found)).toBe(true);
    expect(isRefusal("Das habe ich in den HR-Richtlinien nicht gefunden.", [])).toBe(true);
  });
  it("is false for an ordinary answer or when no search happened", () => {
    expect(isRefusal("Overtime starts above 35 hours [1].", found)).toBe(false);
    expect(isRefusal("Hello! How can I help?", [])).toBe(false);
  });
});
