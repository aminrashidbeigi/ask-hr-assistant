import { describe, expect, it } from "vitest";
import { mockEmbedding } from "@/lib/rag/embed";
import { sha256 } from "@/lib/rag/hash";

const cosine = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);

describe("sha256", () => {
  it("is deterministic and content-sensitive", () => {
    expect(sha256("abc")).toBe(sha256("abc"));
    expect(sha256("abc")).not.toBe(sha256("abd"));
    expect(sha256("abc")).toHaveLength(64);
  });
});

describe("mockEmbedding", () => {
  it("returns a deterministic unit vector with 1536 dims", () => {
    const v = mockEmbedding("Nachtzuschlag 25 %");
    expect(v).toHaveLength(1536);
    expect(v).toEqual(mockEmbedding("Nachtzuschlag 25 %"));
    expect(cosine(v, v)).toBeCloseTo(1, 5);
  });

  it("places texts with shared words closer than unrelated texts", () => {
    const q = mockEmbedding("night shift allowance percent");
    const related = mockEmbedding("the night shift allowance is 25 percent");
    const unrelated = mockEmbedding("travel expenses hotel per night rail");
    expect(cosine(q, related)).toBeGreaterThan(cosine(q, unrelated));
  });
});
