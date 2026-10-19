import { beforeEach, describe, expect, it, vi } from "vitest";

const retrieveMock = vi.fn();
vi.mock("@/lib/rag/retriever", () => ({ retrieve: (...a: unknown[]) => retrieveMock(...a) }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ TOP_K: 6 }) }));

import { createCollector, createTools } from "@/lib/agent/tools";

const chunk = (id: string, extra: object = {}) => ({
  id,
  docId: "d:en",
  policyId: "p",
  title: "Policy",
  section: "Sec",
  url: "/policies/p",
  lang: "en",
  content: `text ${id}`,
  score: 0.03,
  ...extra,
});

// tool.execute is called directly; the SDK passes extra execution options we do not need here.
const run = <T,>(t: { execute?: (...a: never[]) => unknown }, input: unknown) =>
  (t.execute as (i: unknown, o: unknown) => Promise<T>)(input, { toolCallId: "t", messages: [] });

describe("searchPolicies", () => {
  beforeEach(() => retrieveMock.mockReset());

  it("passes the request persona to the retriever (not model-controlled)", async () => {
    retrieveMock.mockResolvedValue({ found: true, chunks: [chunk("a")], topScore: 0.03, bestVectorDistance: 0.2, latencyMs: 1 });
    const tools = createTools({ persona: "office", collector: createCollector() });
    await run(tools.searchPolicies, { query: "overtime", language: "en" });
    expect(retrieveMock).toHaveBeenCalledWith(expect.objectContaining({ persona: "office", lang: "en" }));
  });

  it("numbers sources globally across searches and de-duplicates chunks", async () => {
    const collector = createCollector();
    const seen: number[][] = [];
    const tools = createTools({ persona: "all", collector, onSources: (s) => seen.push(s.map((x) => x.n)) });

    retrieveMock.mockResolvedValueOnce({ found: true, chunks: [chunk("a"), chunk("b")], topScore: 0.03, bestVectorDistance: 0.2, latencyMs: 1 });
    const first = await run<{ results: { n: number }[] }>(tools.searchPolicies, { query: "q1" });
    expect(first.results.map((r) => r.n)).toEqual([1, 2]);

    retrieveMock.mockResolvedValueOnce({ found: true, chunks: [chunk("b"), chunk("c")], topScore: 0.03, bestVectorDistance: 0.2, latencyMs: 1 });
    const second = await run<{ results: { n: number }[] }>(tools.searchPolicies, { query: "q2" });
    expect(second.results.map((r) => r.n)).toEqual([2, 3]); // "b" keeps its number

    expect(collector.sources.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(seen.at(-1)).toEqual([1, 2, 3]);
    expect(collector.searches).toHaveLength(2);
  });

  it("returns found:false without sources when nothing relevant was found", async () => {
    retrieveMock.mockResolvedValue({ found: false, chunks: [chunk("x")], topScore: 0.016, bestVectorDistance: 0.45, latencyMs: 1 });
    const collector = createCollector();
    const tools = createTools({ persona: "all", collector });
    const res = await run<{ found: boolean }>(tools.searchPolicies, { query: "ceo salary" });
    expect(res.found).toBe(false);
    expect(collector.sources).toHaveLength(0);
    expect(collector.searches[0].found).toBe(false);
    expect(collector.retrievedChunkIds.has("x")).toBe(true); // still logged for gap analysis
  });
});

describe("escalateToHR", () => {
  it("returns a fake ticket id and contact text and flags the request as escalated", async () => {
    const collector = createCollector();
    const tools = createTools({ persona: "all", collector });
    const res = await run<{ ticketId: string; contact: string }>(tools.escalateToHR, {
      topic: "Overtime question",
      summary: "Employee asks how overtime is compensated.",
    });
    expect(res.ticketId).toMatch(/^HR-\d{4}-\d{4}$/);
    expect(res.contact).toContain("hr@voltwerk.example");
    expect(collector.escalated).toBe(true);
  });
});
