import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";

config({ path: ".env.local" });
config();

import { closeDb } from "@/lib/db/client";
import { retrieve } from "@/lib/rag/retriever";

// Needs a migrated + ingested database: RUN_INTEGRATION=1 pnpm test
const run = process.env.RUN_INTEGRATION === "1";
const realEmbeddings = process.env.EMBEDDING_PROVIDER !== "mock";

const SHIFT_ONLY = ["shift-allowances-policy", "safety-ppe-policy"];
const OFFICE_ONLY = ["remote-work-policy", "travel-expenses-policy"];

describe.skipIf(!run)("retriever (integration)", () => {
  afterAll(() => closeDb());

  const shiftQueries = [
    "night shift allowance",
    "Wie melde ich einen Arbeitsunfall? PSA Schutzausrüstung",
    "shift swap rules",
  ];

  it.each(shiftQueries)("never returns shift-only policies to persona office: %s", async (query) => {
    const { chunks } = await retrieve({ query, persona: "office", k: 10 });
    expect(chunks.length).toBeGreaterThan(0);
    for (const c of chunks) expect(SHIFT_ONLY).not.toContain(c.policyId);
  });

  it.each(["work from home days", "Reisekosten Hotel pro Nacht"])(
    "never returns office-only policies to persona shift: %s",
    async (query) => {
      const { chunks } = await retrieve({ query, persona: "shift", k: 10 });
      for (const c of chunks) expect(OFFICE_ONLY).not.toContain(c.policyId);
    },
  );

  it("persona 'all' can see shift policies", async () => {
    const { chunks } = await retrieve({ query: "night shift allowance", persona: "all", k: 6 });
    expect(chunks.some((c) => SHIFT_ONLY.includes(c.policyId))).toBe(true);
  });

  it("finds the exact policy term in the top results (hybrid)", async () => {
    const { chunks } = await retrieve({ query: "Nachtzuschlag", persona: "shift", lang: "de", k: 3 });
    expect(chunks.some((c) => c.policyId === "shift-allowances-policy")).toBe(true);
  });

  it("returns cross-lingual hits for an English question", async () => {
    const { chunks } = await retrieve({ query: "How many vacation days per year?", persona: "all", lang: "en", k: 6 });
    expect(chunks.map((c) => c.lang)).toContain("en");
    expect(chunks.some((c) => c.policyId === "vacation-policy")).toBe(true);
    // top-1 precision only holds for real embeddings; the CI mock is a bag-of-words stand-in
    if (realEmbeddings) expect(chunks[0].policyId).toBe("vacation-policy");
  });

  it.skipIf(!realEmbeddings)("reports found=false for an out-of-scope question", async () => {
    const res = await retrieve({ query: "What is the capital of France?", persona: "all" });
    expect(res.found).toBe(false);
  });

  it.skipIf(!realEmbeddings)("reports found=true for an in-scope question", async () => {
    const res = await retrieve({ query: "How many vacation days do I get per year?", persona: "all" });
    expect(res.found).toBe(true);
  });
});
