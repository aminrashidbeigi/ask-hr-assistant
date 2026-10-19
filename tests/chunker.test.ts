import { describe, expect, it } from "vitest";
import { chunkMarkdown, estimateTokens, MAX_TOKENS } from "@/lib/rag/chunker";
import { loadCorpus } from "@/lib/rag/corpus";

const filler = (n: number, word = "Beschäftigte") =>
  Array.from({ length: n }, (_, i) => `${word}${i}`).join(" ");

describe("chunkMarkdown", () => {
  it("keeps heading paths as section and ignores the H1 title", () => {
    const body = `# Shift Work

## Allowances

### Night shift

${filler(60, "night")}

### Sunday work

${filler(60, "sunday")}
`;
    const chunks = chunkMarkdown(body, "Shift Work");
    expect(chunks.map((c) => c.section)).toEqual([
      "Allowances > Night shift",
      "Allowances > Sunday work",
    ]);
    expect(chunks[0].content).not.toContain("Shift Work");
  });

  it("prepends a '{title} — {section}' context header to the embedded text only", () => {
    const [chunk] = chunkMarkdown(`## Rules\n\n${filler(120)}`, "My Policy");
    expect(chunk.embedText.startsWith("My Policy — Rules\n\n")).toBe(true);
    expect(chunk.content.startsWith("My Policy")).toBe(false);
  });

  it("merges tiny sections into the previous chunk, keeping their heading", () => {
    const body = `## Big\n\n${filler(120)}\n\n## Contact\n\nhr@example.com`;
    const chunks = chunkMarkdown(body, "T");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].section).toBe("Big + Contact");
    expect(chunks[0].content).toContain("**Contact**");
  });

  it("never exceeds the max token size, splits big sections and overlaps pieces", () => {
    const paragraphs = Array.from({ length: 12 }, (_, i) => `P${i} ${filler(30, `w${i}x`)}`).join("\n\n");
    const chunks = chunkMarkdown(`## Long\n\n${paragraphs}`, "T");
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(estimateTokens(c.content)).toBeLessThanOrEqual(MAX_TOKENS);
    // overlap: the last paragraph of a piece reappears at the start of the next one
    const lastOfFirst = chunks[0].content.split("\n\n").at(-1)!;
    expect(chunks[1].content.startsWith(lastOfFirst)).toBe(true);
  });

  it("does not split inside a table or list", () => {
    const rows = Array.from({ length: 6 }, (_, i) => `| row${i} | ${filler(20, `c${i}x`)} |`).join("\n");
    const table = `| A | B |\n| --- | --- |\n${rows}`;
    const body = `## Table\n\n${filler(250, "intro")}\n\n${table}\n\n${filler(250, "outro")}`;
    const chunks = chunkMarkdown(body, "T");
    const withTable = chunks.filter((c) => c.content.includes("| row0 |"));
    expect(withTable.length).toBeGreaterThanOrEqual(1);
    for (const c of withTable) {
      for (let i = 0; i < 6; i++) expect(c.content).toContain(`| row${i} |`);
    }
  });

  it("produces stable hashes that change with content", () => {
    const a = chunkMarkdown(`## S\n\n${filler(120)}`, "T")[0];
    const b = chunkMarkdown(`## S\n\n${filler(120)}`, "T")[0];
    const c = chunkMarkdown(`## S\n\n${filler(121)}`, "T")[0];
    expect(a.contentHash).toBe(b.contentHash);
    expect(a.contentHash).not.toBe(c.contentHash);
  });

  it("chunks the whole corpus within bounds", () => {
    for (const doc of loadCorpus()) {
      const chunks = chunkMarkdown(doc.body, doc.title);
      expect(chunks.length).toBeGreaterThan(0);
      chunks.forEach((c, i) => {
        expect(c.index).toBe(i);
        expect(estimateTokens(c.content)).toBeLessThanOrEqual(MAX_TOKENS);
      });
    }
  });
});
