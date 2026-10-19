import { config } from "dotenv";
import { and, eq, inArray, notInArray } from "drizzle-orm";

config({ path: ".env.local" });
config();

import { closeDb, getDb } from "../lib/db/client";
import { chunks, documents } from "../lib/db/schema";
import { getEnv } from "../lib/env";
import { estimateEmbeddingCostUsd } from "../lib/observability/cost";
import { chunkMarkdown } from "../lib/rag/chunker";
import { loadCorpus } from "../lib/rag/corpus";
import { embedTexts } from "../lib/rag/embed";
import { sha256 } from "../lib/rag/hash";

const force = process.argv.includes("--force");

async function main() {
  const env = getEnv();
  const db = getDb();
  const corpus = loadCorpus();

  const existingDocs = new Map(
    (await db.select({ id: documents.id, contentHash: documents.contentHash }).from(documents)).map(
      (d) => [d.id, d.contentHash],
    ),
  );

  const stats = {
    docsAdded: 0,
    docsUpdated: 0,
    docsUnchanged: 0,
    docsDeleted: 0,
    chunksEmbedded: 0,
    chunksKept: 0,
    chunksDeleted: 0,
    tokensEmbedded: 0,
  };

  for (const doc of corpus) {
    const docHash = sha256(doc.raw);
    const known = existingDocs.get(doc.docId);
    if (!force && known === docHash) {
      stats.docsUnchanged++;
      continue;
    }
    if (known) stats.docsUpdated++;
    else stats.docsAdded++;

    const drafts = chunkMarkdown(doc.body, doc.title);

    // Re-use stored embeddings for chunks whose embedded text did not change.
    const existingChunks = force
      ? []
      : await db
          .select({ id: chunks.id, contentHash: chunks.contentHash })
          .from(chunks)
          .where(eq(chunks.documentId, doc.docId));
    const reusable = new Map<string, string[]>();
    for (const c of existingChunks) reusable.set(c.contentHash, [...(reusable.get(c.contentHash) ?? []), c.id]);

    const kept: { id: string; draftIndex: number }[] = [];
    const toEmbed: number[] = [];
    drafts.forEach((d, i) => {
      const ids = reusable.get(d.contentHash);
      const id = ids?.shift();
      if (id) kept.push({ id, draftIndex: i });
      else toEmbed.push(i);
    });

    const { embeddings, tokens } = toEmbed.length
      ? await embedTexts(toEmbed.map((i) => drafts[i].embedText))
      : { embeddings: [], tokens: 0 };

    await db.transaction(async (tx) => {
      const docRow = {
        policyId: doc.id,
        title: doc.title,
        lang: doc.lang,
        audience: doc.audience,
        version: doc.version,
        url: doc.url,
        contentHash: docHash,
        updatedAt: new Date(),
      };
      await tx
        .insert(documents)
        .values({ id: doc.docId, ...docRow })
        .onConflictDoUpdate({ target: documents.id, set: docRow });

      // delete orphaned chunks (everything not kept)
      const keptIds = kept.map((k) => k.id);
      const orphanFilter = keptIds.length
        ? and(eq(chunks.documentId, doc.docId), notInArray(chunks.id, keptIds))
        : eq(chunks.documentId, doc.docId);
      const deleted = await tx.delete(chunks).where(orphanFilter).returning({ id: chunks.id });
      stats.chunksDeleted += deleted.length;

      for (const k of kept) {
        const d = drafts[k.draftIndex];
        await tx
          .update(chunks)
          .set({
            chunkIndex: d.index,
            section: d.section,
            content: d.content,
            tokenCount: d.tokenCount,
            lang: doc.lang,
            audience: doc.audience,
          })
          .where(eq(chunks.id, k.id));
      }

      if (toEmbed.length) {
        await tx.insert(chunks).values(
          toEmbed.map((draftIndex, j) => {
            const d = drafts[draftIndex];
            return {
              documentId: doc.docId,
              chunkIndex: d.index,
              section: d.section,
              content: d.content,
              tokenCount: d.tokenCount,
              lang: doc.lang,
              audience: doc.audience,
              embedding: embeddings[j],
              contentHash: d.contentHash,
            };
          }),
        );
      }
    });

    stats.chunksKept += kept.length;
    stats.chunksEmbedded += toEmbed.length;
    stats.tokensEmbedded += tokens;
    console.log(
      `${known ? "updated" : "added  "} ${doc.docId.padEnd(34)} chunks: ${drafts.length} (embedded ${toEmbed.length}, reused ${kept.length})`,
    );
  }

  // Remove documents whose source file no longer exists (chunks cascade).
  const present = corpus.map((d) => d.docId);
  const stale = [...existingDocs.keys()].filter((id) => !present.includes(id));
  if (stale.length) {
    await db.delete(documents).where(inArray(documents.id, stale));
    stats.docsDeleted = stale.length;
  }

  const cost = estimateEmbeddingCostUsd(env.EMBEDDING_MODEL, stats.tokensEmbedded);
  console.log(`
Ingestion summary${force ? " (--force)" : ""}
  documents: ${stats.docsAdded} added, ${stats.docsUpdated} updated, ${stats.docsUnchanged} unchanged, ${stats.docsDeleted} deleted
  chunks:    ${stats.chunksEmbedded} embedded, ${stats.chunksKept} reused, ${stats.chunksDeleted} deleted
  tokens embedded: ${stats.tokensEmbedded} (provider: ${env.EMBEDDING_PROVIDER})
  estimated cost:  $${cost.toFixed(5)}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
