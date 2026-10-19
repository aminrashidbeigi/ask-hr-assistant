CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"section" text NOT NULL,
	"content" text NOT NULL,
	"token_count" integer NOT NULL,
	"lang" text NOT NULL,
	"audience" text[] NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', section || ' ' || content)) STORED,
	"content_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"policy_id" text NOT NULL,
	"title" text NOT NULL,
	"lang" text NOT NULL,
	"audience" text[] NOT NULL,
	"version" text NOT NULL,
	"url" text NOT NULL,
	"content_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_log_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"comment_redacted" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "query_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"trace_id" text,
	"session_id" text,
	"persona" text NOT NULL,
	"lang" text,
	"question_redacted" text NOT NULL,
	"answer_redacted" text,
	"retrieved_chunk_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"top_score" numeric,
	"refused" boolean DEFAULT false NOT NULL,
	"escalated" boolean DEFAULT false NOT NULL,
	"tool_calls" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"ttft_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_usd" numeric(12, 6) DEFAULT 0 NOT NULL,
	"model" text,
	"prompt_version" text,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_query_log_id_query_logs_id_fk" FOREIGN KEY ("query_log_id") REFERENCES "public"."query_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chunks_embedding_hnsw" ON "chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "chunks_tsv_gin" ON "chunks" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "chunks_document_id_idx" ON "chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "query_logs_created_at_idx" ON "query_logs" USING btree ("created_at");