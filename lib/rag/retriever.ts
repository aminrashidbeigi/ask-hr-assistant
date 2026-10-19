import { SpanStatusCode, trace } from "@opentelemetry/api";
import { sql, type SQL } from "drizzle-orm";
import pgvector from "pgvector";
import { getDb } from "@/lib/db/client";
import { getEnv } from "@/lib/env";
import { embedQuery } from "./embed";
import {
  applyLangBoost,
  audiencesFor,
  buildTsQuery,
  isVisibleTo,
  rrfFuse,
  type Persona,
} from "./fusion";

export type { Persona } from "./fusion";
export type RetrievalMode = "hybrid" | "vector";

const CANDIDATES = 20;
const tracer = trace.getTracer("ask-hr");

export interface RetrievedChunk {
  id: string;
  docId: string;
  /** front-matter id shared by the DE and EN version, e.g. "vacation-policy" */
  policyId: string;
  title: string;
  section: string;
  url: string;
  lang: string;
  content: string;
  /** fused (RRF) score, after the language boost */
  score: number;
}

export interface RetrievalResult {
  found: boolean;
  chunks: RetrievedChunk[];
  /** diagnostics, used for logs, evals and threshold tuning */
  topScore: number;
  bestVectorDistance: number | null;
  latencyMs: number;
}

interface Row {
  id: string;
  document_id: string;
  policy_id: string;
  title: string;
  section: string;
  url: string;
  lang: string;
  content: string;
  audience: string[];
  dist?: number;
}

export interface RetrieveOptions {
  query: string;
  persona: Persona;
  lang?: string;
  k?: number;
  mode?: RetrievalMode;
}

function audienceFilter(persona: Persona): SQL {
  const allowed = audiencesFor(persona);
  if (!allowed) return sql`TRUE`;
  const list = sql.join(
    allowed.map((a) => sql`${a}`),
    sql`, `,
  );
  return sql`c.audience && ARRAY[${list}]::text[]`;
}

const COLUMNS = sql`c.id, c.document_id, d.policy_id, d.title, c.section, d.url, c.lang, c.content, c.audience`;

export async function retrieve(opts: RetrieveOptions): Promise<RetrievalResult> {
  const env = getEnv();
  const { query, persona, lang } = opts;
  const k = opts.k ?? env.TOP_K;
  const mode = opts.mode ?? env.RETRIEVAL_MODE;

  return tracer.startActiveSpan("rag.retrieve", async (span) => {
    const started = performance.now();
    try {
      const db = getDb();
      const filter = audienceFilter(persona);

      const {
        embeddings: [embedding],
      } = await embedQuery(query);
      const vec = pgvector.toSql(embedding);

      const vectorRows = (await db.execute(sql`
        SELECT ${COLUMNS}, c.embedding <=> ${vec}::vector AS dist
        FROM chunks c JOIN documents d ON d.id = c.document_id
        WHERE ${filter}
        ORDER BY c.embedding <=> ${vec}::vector
        LIMIT ${CANDIDATES}
      `)) as unknown as Row[];

      let keywordRows: Row[] = [];
      const tsQuery = mode === "hybrid" ? buildTsQuery(query) : null;
      if (tsQuery) {
        keywordRows = (await db.execute(sql`
          SELECT ${COLUMNS}
          FROM chunks c JOIN documents d ON d.id = c.document_id,
               to_tsquery('simple', ${tsQuery}) q
          WHERE c.tsv @@ q AND ${filter}
          ORDER BY ts_rank_cd(c.tsv, q) DESC
          LIMIT ${CANDIDATES}
        `)) as unknown as Row[];
      }

      const byId = new Map<string, Row>();
      for (const r of [...vectorRows, ...keywordRows]) byId.set(r.id, r);

      const fused = rrfFuse([vectorRows.map((r) => r.id), keywordRows.map((r) => r.id)])
        .map(({ id, score }) => ({ ...byId.get(id)!, score }))
        .filter((r) => isVisibleTo(r.audience, persona));

      const ranked = applyLangBoost(fused, lang).slice(0, k);

      const chunks: RetrievedChunk[] = ranked.map((r) => ({
        id: r.id,
        docId: r.document_id,
        policyId: r.policy_id,
        title: r.title,
        section: r.section,
        url: r.url,
        lang: r.lang,
        content: r.content,
        score: r.score,
      }));

      const topScore = chunks[0]?.score ?? 0;
      const bestVectorDistance = vectorRows.length ? Number(vectorRows[0].dist) : null;
      const found =
        chunks.length > 0 &&
        topScore >= env.MIN_RELEVANCE &&
        bestVectorDistance !== null &&
        bestVectorDistance <= env.MAX_VECTOR_DISTANCE;

      const latencyMs = Math.round(performance.now() - started);
      span.setAttributes({
        "rag.query_length": query.length,
        "rag.k": k,
        "rag.persona": persona,
        "rag.mode": mode,
        "rag.found": found,
        "rag.top_score": topScore,
        "rag.best_vector_distance": bestVectorDistance ?? -1,
        "rag.latency_ms": latencyMs,
      });
      return { found, chunks, topScore, bestVectorDistance, latencyMs };
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
      throw err;
    } finally {
      span.end();
    }
  });
}
