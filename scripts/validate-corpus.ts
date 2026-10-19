import path from "node:path";
import { loadCorpus, type PolicyDoc as Doc } from "../lib/rag/corpus";

/** Numbers normalised across DE/EN formats ("2,5" -> "2.5", "1.500"/"1,500" -> "1500"). */
function numbers(text: string): string[] {
  const body = text.replace(/(\d)[.,](\d{3})(?!\d)/g, "$1$2").replace(/(\d),(\d)/g, "$1.$2");
  return (body.match(/\d+(?:\.\d+)?/g) ?? []).sort();
}

function main() {
  const docs = loadCorpus();
  const errors: string[] = [];
  const byId = new Map<string, Doc[]>();
  for (const d of docs) byId.set(d.id, [...(byId.get(d.id) ?? []), d]);

  for (const [id, group] of byId) {
    const langs = group.map((d) => d.lang).sort().join(",");
    if (langs !== "de,en") errors.push(`${id}: expected one de and one en file, got [${langs}]`);
    if (group.length === 2) {
      const [en, de] = [group.find((d) => d.lang === "en")!, group.find((d) => d.lang === "de")!];
      if (en.audience.join() !== de.audience.join()) errors.push(`${id}: audience differs between languages`);
      if (en.version !== de.version) errors.push(`${id}: version differs between languages`);
      // Compare the set of distinct numbers; counts may differ with phrasing.
      const a = new Set(numbers(en.body));
      const b = new Set(numbers(de.body));
      const onlyEn = [...a].filter((n) => !b.has(n));
      const onlyDe = [...b].filter((n) => !a.has(n));
      if (onlyEn.length || onlyDe.length) {
        errors.push(`${id}: numbers differ — only EN: [${onlyEn}] only DE: [${onlyDe}]`);
      }
    }
  }

  for (const d of docs) {
    const words = d.body.split(/\s+/).filter(Boolean).length;
    if (words < 300) errors.push(`${path.basename(d.file)}: only ${words} words`);
    console.log(`${d.lang} ${d.id.padEnd(28)} ${String(words).padStart(4)} words  audience=${d.audience}`);
  }

  console.log(`\n${docs.length} files, ${byId.size} policies`);
  if (docs.length !== 20) errors.push(`expected 20 files, found ${docs.length}`);
  if (errors.length) {
    console.error("\nValidation errors:\n- " + errors.join("\n- "));
    process.exit(1);
  }
  console.log("Corpus OK");
}

main();
