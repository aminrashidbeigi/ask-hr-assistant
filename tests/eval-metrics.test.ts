import { describe, expect, it } from "vitest";
import {
  checkCitations,
  firstRelevantRank,
  mean,
  mrr,
  parseCitations,
  percentile,
  recallAtK,
  stratifiedSubset,
  sweepThresholds,
} from "../eval/metrics";

describe("percentile / mean", () => {
  it("nearest-rank percentiles", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(xs, 50)).toBe(5);
    expect(percentile(xs, 95)).toBe(10);
    expect(percentile([], 50)).toBeNull();
    expect(mean([1, 2, 3])).toBe(2);
  });
});

describe("citations", () => {
  it("parses [1], [2][3] and [1, 2]", () => {
    expect(parseCitations("A [1]. B [2][3]. C [1, 4].")).toEqual([1, 2, 3, 1, 4]);
    expect(parseCitations("no citations, array[0] stays out? [x]")).toEqual([0]);
  });

  it("validates against returned sources and expected documents", () => {
    const sources = [
      { n: 1, policyId: "vacation-policy" },
      { n: 2, policyId: "overtime-policy" },
    ];
    expect(checkCitations("30 days [1].", sources, ["vacation-policy"])).toEqual({ total: 1, valid: 1, invalid: [] });
    // [2] exists but belongs to an unexpected document, [9] does not exist at all
    expect(checkCitations("x [1] y [2] z [9]", sources, ["vacation-policy"])).toEqual({ total: 3, valid: 1, invalid: [2, 9] });
    // no expected docs (e.g. unanswerable): only existence matters
    expect(checkCitations("x [2]", sources, [])).toEqual({ total: 1, valid: 1, invalid: [] });
  });
});

describe("retrieval metrics", () => {
  it("finds the first relevant rank, recall@k and MRR", () => {
    expect(firstRelevantRank(["a", "b", "c"], ["c"])).toBe(3);
    expect(firstRelevantRank(["a"], ["z"])).toBeNull();
    const ranks = [1, 3, null, 2];
    expect(recallAtK(ranks, 2)).toBeCloseTo(0.5);
    expect(recallAtK(ranks, 6)).toBeCloseTo(0.75);
    expect(mrr(ranks)).toBeCloseTo((1 + 1 / 3 + 0 + 1 / 2) / 4);
    expect(recallAtK([], 6)).toBeNull();
  });
});

describe("sweepThresholds", () => {
  const probes = [
    { answerable: true, bestVectorDistance: 0.25, topScore: 0.032 },
    { answerable: true, bestVectorDistance: 0.3, topScore: 0.03 },
    { answerable: false, bestVectorDistance: 0.45, topScore: 0.016 },
    { answerable: false, bestVectorDistance: 0.36, topScore: 0.031 },
  ];
  it("reports false refusal / false answer rates per threshold pair", () => {
    const rows = sweepThresholds(probes, [0.2, 0.33, 0.5], [0]);
    const at = (d: number) => rows.find((r) => r.maxDistance === d)!;
    expect(at(0.2)).toMatchObject({ falseRefusalRate: 1, falseAnswerRate: 0 });
    expect(at(0.33)).toMatchObject({ falseRefusalRate: 0, falseAnswerRate: 0, accuracy: 1 });
    expect(at(0.5)).toMatchObject({ falseRefusalRate: 0, falseAnswerRate: 1 });
  });
  it("min relevance can reject low RRF scores", () => {
    const rows = sweepThresholds(probes, [0.5], [0, 0.02]);
    expect(rows.find((r) => r.minRelevance === 0.02)!.falseAnswerRate).toBe(0.5);
  });
});

describe("stratifiedSubset", () => {
  const items = [
    ...["a1", "a2", "a3", "a4"].map((id) => ({ id, type: "a" })),
    ...["b1", "b2"].map((id) => ({ id, type: "b" })),
    { id: "c1", type: "c" },
  ];
  it("covers every type first and keeps original order", () => {
    expect(stratifiedSubset(items, 3).map((i) => i.id)).toEqual(["a1", "b1", "c1"]);
    expect(stratifiedSubset(items, 5).map((i) => i.id)).toEqual(["a1", "a2", "b1", "b2", "c1"]);
    expect(stratifiedSubset(items, 99)).toHaveLength(7);
  });
});
