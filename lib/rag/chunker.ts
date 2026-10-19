import { sha256 } from "./hash";

/** Upper bound for a chunk, including overlap. */
export const MAX_TOKENS = 500;
/**
 * Sections smaller than this are merged with a neighbour. Kept low on purpose: the corpus has short
 * sections, and merging more aggressively blurs section labels and makes citations less precise.
 */
export const MIN_TOKENS = 40;
/** Share of MAX_TOKENS carried over between pieces of an oversized section. */
export const OVERLAP_RATIO = 0.15;

export interface ChunkDraft {
  index: number;
  /** heading path, e.g. "Allowances > Night shift" */
  section: string;
  content: string;
  /** "{title} — {section}\n\n{content}" — what gets embedded (contextual chunking) */
  embedText: string;
  tokenCount: number;
  contentHash: string;
}

/** Cheap token estimate (~4 chars per token); good enough for size bounds and cost estimates. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface Section {
  path: string[];
  /** last heading name, used when sections are merged */
  heading: string;
  blocks: string[];
}

interface Unit {
  label: string[];
  text: string;
  tokens: number;
}

const HEADING = /^(#{1,3})\s+(.+?)\s*$/;

function parseSections(body: string, title: string): Section[] {
  const sections: Section[] = [];
  let h2 = "";
  let current: Section = { path: ["Overview"], heading: "Overview", blocks: [] };
  let buffer: string[] = [];

  const flushBlock = () => {
    if (buffer.length) current.blocks.push(buffer.join("\n"));
    buffer = [];
  };
  const startSection = (path: string[], heading: string) => {
    flushBlock();
    if (current.blocks.length) sections.push(current);
    current = { path, heading, blocks: [] };
  };

  for (const line of body.split(/\r?\n/)) {
    const m = HEADING.exec(line);
    if (m) {
      const level = m[1].length;
      const name = m[2];
      if (level === 1) {
        if (name !== title) startSection([name], name);
        continue;
      }
      if (level === 2) {
        h2 = name;
        startSection([name], name);
      } else {
        startSection(h2 ? [h2, name] : [name], name);
      }
      continue;
    }
    // Consecutive non-blank lines form one block, so lists and tables stay together.
    if (line.trim() === "") flushBlock();
    else buffer.push(line);
  }
  flushBlock();
  if (current.blocks.length) sections.push(current);
  return sections;
}

/** Split a block that alone exceeds MAX_TOKENS, at line (row / item) boundaries, then sentences. */
function splitOversizedBlock(block: string): string[] {
  const pieces: string[] = [];
  let acc: string[] = [];
  const flush = () => {
    if (acc.length) pieces.push(acc.join("\n"));
    acc = [];
  };
  const units = block
    .split("\n")
    .flatMap((line) =>
      estimateTokens(line) > MAX_TOKENS ? line.split(/(?<=[.!?])\s+/) : [line],
    );
  for (const unit of units) {
    if (acc.length && estimateTokens([...acc, unit].join("\n")) > MAX_TOKENS) flush();
    acc.push(unit);
  }
  flush();
  return pieces;
}

/** Pack the blocks of one section into pieces of at most MAX_TOKENS, with block-level overlap. */
function packSection(blocks: string[]): string[] {
  const expanded = blocks.flatMap((b) =>
    estimateTokens(b) > MAX_TOKENS ? splitOversizedBlock(b) : [b],
  );
  if (estimateTokens(expanded.join("\n\n")) <= MAX_TOKENS) return [expanded.join("\n\n")];

  const overlapBudget = Math.floor(MAX_TOKENS * OVERLAP_RATIO);
  const pieces: string[] = [];
  let current: string[] = [];

  for (const block of expanded) {
    if (current.length && estimateTokens([...current, block].join("\n\n")) > MAX_TOKENS) {
      pieces.push(current.join("\n\n"));
      // carry the trailing block(s) over, as long as they fit the overlap budget
      const carry: string[] = [];
      for (let i = current.length - 1; i >= 0; i--) {
        if (estimateTokens([current[i], ...carry].join("\n\n")) > overlapBudget) break;
        carry.unshift(current[i]);
      }
      current = estimateTokens([...carry, block].join("\n\n")) <= MAX_TOKENS ? carry : [];
    }
    current.push(block);
  }
  if (current.length) pieces.push(current.join("\n\n"));
  return pieces;
}

function mergeSmallUnits(units: Unit[], headings: string[]): Unit[] {
  const merged: Unit[] = [];
  let pending: Unit | null = null; // tiny leading unit, merged forward into the next one
  for (let i = 0; i < units.length; i++) {
    let unit = units[i];
    if (pending) {
      const text = `${pending.text}\n\n**${headings[i]}**\n\n${unit.text}`;
      unit = { label: [...pending.label, ...unit.label], text, tokens: estimateTokens(text) };
      pending = null;
    }
    const prev = merged[merged.length - 1];
    if (unit.tokens < MIN_TOKENS) {
      if (!prev) {
        pending = unit;
        continue;
      }
      const text = `${prev.text}\n\n**${headings[i]}**\n\n${unit.text}`;
      if (estimateTokens(text) <= MAX_TOKENS) {
        merged[merged.length - 1] = {
          label: [...prev.label, ...unit.label],
          text,
          tokens: estimateTokens(text),
        };
        continue;
      }
    }
    merged.push(unit);
  }
  if (pending) merged.push(pending);
  return merged;
}

/**
 * Heading-aware chunker. Splits on H2/H3, keeps the heading path as `section`,
 * merges tiny sections, splits oversized ones with ~15 % overlap and never cuts inside a
 * list or table row. The embedded text carries a "{title} — {section}" context header.
 */
export function chunkMarkdown(body: string, title: string): ChunkDraft[] {
  const sections = parseSections(body, title);
  const units: Unit[] = [];
  const headings: string[] = [];
  for (const s of sections) {
    for (const text of packSection(s.blocks)) {
      units.push({ label: [s.path.join(" > ")], text, tokens: estimateTokens(text) });
      headings.push(s.heading);
    }
  }

  return mergeSmallUnits(units, headings).map((u, index) => {
    const section = u.label.join(" + ");
    const content = u.text.trim();
    const embedText = `${title} — ${section}\n\n${content}`;
    return {
      index,
      section,
      content,
      embedText,
      tokenCount: estimateTokens(embedText),
      contentHash: sha256(embedText),
    };
  });
}
