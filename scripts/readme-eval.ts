import fs from "node:fs";
import path from "node:path";

/**
 * Fills the evaluation section of README.md (between the EVAL:START / EVAL:END markers) from the
 * real report files, so the README never contains hand-typed numbers.
 * Usage: pnpm eval:readme   (after pnpm eval / pnpm eval:compare / pnpm eval --retrieval-only)
 */
const root = process.cwd();
const reports = path.join(root, "eval", "reports");
const read = (f: string) => (fs.existsSync(path.join(reports, f)) ? fs.readFileSync(path.join(reports, f), "utf8") : null);

/** Table lines of every "## <heading>" section, keyed by heading. */
function tablesBySection(md: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const block of md.split(/^## /m).slice(1)) {
    const [heading, ...rest] = block.split("\n");
    const table = rest.filter((l) => l.startsWith("|")).join("\n");
    if (table) out[heading.trim()] = table;
  }
  return out;
}

const meta = (md: string, key: string) => new RegExp(`\\*\\*${key}:\\*\\* (.*)`).exec(md)?.[1] ?? "?";
const parts: string[] = [];

const retrieval = read("retrieval-latest.md");
if (retrieval) {
  parts.push("#### Retrieval only (no LLM calls): vector-only vs hybrid", "");
  const sections = tablesBySection(retrieval);
  for (const [heading, table] of Object.entries(sections)) {
    if (heading.startsWith("Threshold sweep")) continue;
    parts.push(`**${heading}**`, "", table, "");
  }
  const best = /Best accuracy .*/.exec(retrieval)?.[0];
  const range = /Best vector distance: .*/.exec(retrieval)?.[0];
  if (best) parts.push(`Threshold sweep for the "found" decision: ${best}. ${range ?? ""}`, "");
}

const latest = read("latest.md");
if (latest) {
  const summary = tablesBySection(latest)["Summary"];
  const ops = tablesBySection(latest)["Operations"];
  parts.push(
    `#### End-to-end (${meta(latest, "Retrieval mode")} retrieval, prompt ${meta(latest, "Prompt version")}, chat \`${meta(latest, "Chat model")}\`, judge \`${meta(latest, "Judge model")}\`, ${meta(latest, "Questions")})`,
    "",
    summary,
    "",
    ops,
    "",
  );
}

const comparison = read("comparison.md");
parts.push("#### Vector-only vs hybrid, end to end", "");
if (comparison) {
  parts.push(comparison.split("\n").filter((l) => l.startsWith("|")).join("\n"), "");
} else {
  parts.push(
    "_Not yet run — needs LLM quota:_ `pnpm eval --mode vector --tag vector && pnpm eval --mode hybrid --tag hybrid && pnpm eval:compare && pnpm eval:readme`.",
    "",
  );
}

const readmePath = path.join(root, "README.md");
const readme = fs.readFileSync(readmePath, "utf8");
const block = `<!-- EVAL:START -->\n${parts.join("\n").trim()}\n<!-- EVAL:END -->`;
if (!/<!-- EVAL:START -->[\s\S]*<!-- EVAL:END -->/.test(readme)) throw new Error("EVAL:START/END markers not found in README.md");
fs.writeFileSync(readmePath, readme.replace(/<!-- EVAL:START -->[\s\S]*<!-- EVAL:END -->/, () => block));
console.log("README.md evaluation section updated.");
