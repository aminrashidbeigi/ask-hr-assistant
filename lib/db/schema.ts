import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

export const EMBEDDING_DIMS = 1536;

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const documents = pgTable("documents", {
  /** front-matter id + language, e.g. "vacation-policy:de" */
  id: text("id").primaryKey(),
  /** front-matter id, shared between the DE and EN version (used by the eval) */
  policyId: text("policy_id").notNull(),
  title: text("title").notNull(),
  lang: text("lang").notNull(),
  audience: text("audience").array().notNull(),
  version: text("version").notNull(),
  url: text("url").notNull(),
  contentHash: text("content_hash").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    /** heading path, e.g. "Allowances > Night shift" */
    section: text("section").notNull(),
    content: text("content").notNull(),
    tokenCount: integer("token_count").notNull(),
    lang: text("lang").notNull(),
    audience: text("audience").array().notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMS }).notNull(),
    tsv: tsvector("tsv").generatedAlwaysAs(
      sql`to_tsvector('simple', section || ' ' || content)`,
    ),
    contentHash: text("content_hash").notNull(),
  },
  (t) => [
    index("chunks_embedding_hnsw").using("hnsw", t.embedding.op("vector_cosine_ops")),
    index("chunks_tsv_gin").using("gin", t.tsv),
    index("chunks_document_id_idx").on(t.documentId),
  ],
);

export const queryLogs = pgTable(
  "query_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    traceId: text("trace_id"),
    /** random, client-generated; not tied to any identity */
    sessionId: text("session_id"),
    persona: text("persona").notNull(),
    lang: text("lang"),
    questionRedacted: text("question_redacted").notNull(),
    answerRedacted: text("answer_redacted"),
    retrievedChunkIds: text("retrieved_chunk_ids").array().notNull().default(sql`'{}'::text[]`),
    topScore: numeric("top_score", { mode: "number" }),
    refused: boolean("refused").notNull().default(false),
    escalated: boolean("escalated").notNull().default(false),
    toolCalls: integer("tool_calls").notNull().default(0),
    latencyMs: integer("latency_ms"),
    ttftMs: integer("ttft_ms"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6, mode: "number" }).notNull().default(0),
    model: text("model"),
    promptVersion: text("prompt_version"),
    error: text("error"),
  },
  (t) => [index("query_logs_created_at_idx").on(t.createdAt)],
);

export const feedback = pgTable("feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  queryLogId: uuid("query_log_id")
    .notNull()
    .references(() => queryLogs.id, { onDelete: "cascade" }),
  /** +1 or -1 */
  rating: smallint("rating").notNull(),
  commentRedacted: text("comment_redacted"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Document = typeof documents.$inferSelect;
export type Chunk = typeof chunks.$inferSelect;
export type QueryLog = typeof queryLogs.$inferSelect;
