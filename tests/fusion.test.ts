import { describe, expect, it } from "vitest";
import {
  applyLangBoost,
  audiencesFor,
  buildTsQuery,
  isVisibleTo,
  LANG_BOOST,
  rrfFuse,
} from "@/lib/rag/fusion";

describe("rrfFuse", () => {
  it("scores 1/(60+rank) and sums across lists", () => {
    const fused = rrfFuse([
      ["a", "b", "c"],
      ["b", "d"],
    ]);
    const score = (id: string) => fused.find((f) => f.id === id)!.score;
    expect(score("a")).toBeCloseTo(1 / 61, 10);
    expect(score("b")).toBeCloseTo(1 / 62 + 1 / 61, 10);
    expect(score("c")).toBeCloseTo(1 / 63, 10);
    expect(score("d")).toBeCloseTo(1 / 62, 10);
  });

  it("ranks items found by both lists above items found by one", () => {
    const fused = rrfFuse([["only-vec", "both"], ["both", "only-kw"]]);
    expect(fused[0].id).toBe("both");
  });

  it("handles empty lists", () => {
    expect(rrfFuse([[], []])).toEqual([]);
    expect(rrfFuse([["a"], []])).toHaveLength(1);
  });

  it("is deterministic on ties", () => {
    const a = rrfFuse([["x"], ["y"]]).map((f) => f.id);
    const b = rrfFuse([["x"], ["y"]]).map((f) => f.id);
    expect(a).toEqual(b);
  });
});

describe("persona filter", () => {
  it("maps personas to allowed audiences; 'all' is unfiltered", () => {
    expect(audiencesFor("shift")).toEqual(["all", "shift"]);
    expect(audiencesFor("office")).toEqual(["all", "office"]);
    expect(audiencesFor("all")).toBeNull();
  });

  it("never shows a shift-only chunk to office (and vice versa)", () => {
    expect(isVisibleTo(["shift"], "office")).toBe(false);
    expect(isVisibleTo(["office"], "shift")).toBe(false);
    expect(isVisibleTo(["all"], "office")).toBe(true);
    expect(isVisibleTo(["shift", "office"], "office")).toBe(true);
    expect(isVisibleTo(["shift"], "all")).toBe(true);
  });
});

describe("buildTsQuery", () => {
  it("drops stopwords (DE + EN), ORs the rest and prefix-matches longer terms", () => {
    expect(buildTsQuery("Wie hoch ist der Nachtzuschlag?")).toBe("hoch | nachtzuschlag:*");
    expect(buildTsQuery("What is the night shift allowance?")).toBe("night:* | shift:* | allowance:*");
  });

  it("keeps numbers and symbols-free terms, and dedupes", () => {
    expect(buildTsQuery("§ 5 vacation vacation 30")).toBe("vacation:* | 30");
  });

  it("is injection-safe: only letters/digits survive", () => {
    expect(buildTsQuery("night' | !(drop table) & x")).toBe("night:* | drop | table:*");
  });

  it("returns null when nothing searchable remains", () => {
    expect(buildTsQuery("wie ist das?")).toBeNull();
    expect(buildTsQuery("")).toBeNull();
  });
});

describe("applyLangBoost", () => {
  const items = [
    { id: "en", lang: "en", score: 0.0300 },
    { id: "de", lang: "de", score: 0.0305 },
  ];
  it("slightly boosts the question's language but keeps cross-lingual hits", () => {
    const out = applyLangBoost(items, "en");
    expect(out[0].id).toBe("en");
    expect(out[0].score).toBeCloseTo(0.03 * LANG_BOOST, 10);
    expect(out).toHaveLength(2);
  });
  it("does nothing without a language", () => {
    expect(applyLangBoost(items, undefined)).toEqual(items);
  });
});
