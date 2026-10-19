import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";

export const POLICY_DIR = path.join(process.cwd(), "data", "policies");

export const frontMatterSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  lang: z.enum(["en", "de"]),
  audience: z.array(z.enum(["all", "shift", "office"])).min(1),
  version: z.string(),
  effective_date: z.union([z.string(), z.date()]),
  owner: z.string(),
  url: z.string().startsWith("/policies/"),
});

export type PolicyDoc = z.infer<typeof frontMatterSchema> & {
  /** `${id}:${lang}` — primary key in the documents table */
  docId: string;
  file: string;
  /** markdown body without front-matter */
  body: string;
  /** the complete file as read from disk, used for change detection */
  raw: string;
};

export function loadCorpus(dir = POLICY_DIR): PolicyDoc[] {
  const docs: PolicyDoc[] = [];
  for (const lang of ["en", "de"]) {
    const langDir = path.join(dir, lang);
    for (const f of fs.readdirSync(langDir).filter((f) => f.endsWith(".md")).sort()) {
      const file = path.join(langDir, f);
      const raw = fs.readFileSync(file, "utf8");
      const parsed = matter(raw);
      const fm = frontMatterSchema.parse(parsed.data);
      docs.push({ ...fm, docId: `${fm.id}:${fm.lang}`, file, body: parsed.content, raw });
    }
  }
  return docs;
}
