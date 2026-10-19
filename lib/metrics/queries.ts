import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export interface Kpis {
  questions24h: number;
  questions7d: number;
  refusalRate: number | null;
  escalationRate: number | null;
  thumbsUpRatio: number | null;
  feedbackCount: number;
  latencyP95Ms: number | null;
  ttftP50Ms: number | null;
  costToday: number;
  cost7d: number;
  errorRate: number | null;
}

/** Aggregate KPIs. Rates and latencies cover the last 7 days; errors are excluded from refusal/latency. */
export async function getKpis(): Promise<Kpis> {
  const db = getDb();
  const [q] = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS q24,
      count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS q7,
      avg(refused::int) FILTER (WHERE error IS NULL AND created_at > now() - interval '7 days') AS refusal_rate,
      avg(escalated::int) FILTER (WHERE error IS NULL AND created_at > now() - interval '7 days') AS escalation_rate,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)
        FILTER (WHERE error IS NULL AND created_at > now() - interval '7 days') AS p95,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY ttft_ms)
        FILTER (WHERE error IS NULL AND created_at > now() - interval '7 days') AS ttft50,
      COALESCE(sum(cost_usd) FILTER (WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc'), 0)::float8 AS cost_today,
      COALESCE(sum(cost_usd) FILTER (WHERE created_at > now() - interval '7 days'), 0)::float8 AS cost7,
      avg((error IS NOT NULL)::int) FILTER (WHERE created_at > now() - interval '7 days') AS error_rate
    FROM query_logs`);
  const [f] = await db.execute(sql`
    SELECT avg((rating = 1)::int) AS up, count(*)::int AS cnt FROM feedback WHERE created_at > now() - interval '7 days'`);
  return {
    questions24h: Number(q.q24 ?? 0),
    questions7d: Number(q.q7 ?? 0),
    refusalRate: n(q.refusal_rate),
    escalationRate: n(q.escalation_rate),
    thumbsUpRatio: n(f.up),
    feedbackCount: Number(f.cnt ?? 0),
    latencyP95Ms: n(q.p95),
    ttftP50Ms: n(q.ttft50),
    costToday: Number(q.cost_today ?? 0),
    cost7d: Number(q.cost7 ?? 0),
    errorRate: n(q.error_rate),
  };
}

export interface DailyPoint {
  day: string;
  questions: number;
  refusalRate: number | null;
  cost: number;
}

/** Last 14 days (UTC), including days without traffic. */
export async function getDaily(days = 14): Promise<DailyPoint[]> {
  const rows = await getDb().execute(sql`
    SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
           count(q.id)::int AS questions,
           avg(q.refused::int) FILTER (WHERE q.error IS NULL) AS refusal_rate,
           COALESCE(sum(q.cost_usd), 0)::float8 AS cost
    FROM generate_series(
           date_trunc('day', now() AT TIME ZONE 'utc') - make_interval(days => ${days - 1}::int),
           date_trunc('day', now() AT TIME ZONE 'utc'),
           interval '1 day') AS d(day)
    LEFT JOIN query_logs q ON date_trunc('day', q.created_at AT TIME ZONE 'utc') = d.day
    GROUP BY d.day ORDER BY d.day`);
  return rows.map((r) => ({
    day: String(r.day),
    questions: Number(r.questions),
    refusalRate: n(r.refusal_rate),
    cost: Number(r.cost),
  }));
}

export interface UnansweredQuestion {
  question: string;
  count: number;
  lastAsked: Date;
}

/** The content-gap report: questions the assistant could not answer, most frequent first. */
export async function getTopUnanswered(limit = 10): Promise<UnansweredQuestion[]> {
  const rows = await getDb().execute(sql`
    SELECT question_redacted AS question, count(*)::int AS count, max(created_at) AS last_asked
    FROM query_logs
    WHERE refused AND error IS NULL AND created_at > now() - interval '30 days'
    GROUP BY question_redacted ORDER BY count DESC, last_asked DESC LIMIT ${limit}`);
  return rows.map((r) => ({ question: String(r.question), count: Number(r.count), lastAsked: new Date(r.last_asked as string) }));
}

export interface DocumentUsage {
  policyId: string;
  title: string;
  retrievals: number;
}

/** Documents that show up most in retrieval results (a proxy for "most used"). */
export async function getMostRetrievedDocuments(limit = 8): Promise<DocumentUsage[]> {
  const rows = await getDb().execute(sql`
    SELECT d.policy_id AS policy_id,
           COALESCE(max(d.title) FILTER (WHERE d.lang = 'en'), min(d.title)) AS title,
           count(*)::int AS retrievals
    FROM query_logs q
    CROSS JOIN LATERAL unnest(q.retrieved_chunk_ids) AS cid
    JOIN chunks c ON c.id::text = cid
    JOIN documents d ON d.id = c.document_id
    WHERE q.created_at > now() - interval '30 days'
    GROUP BY d.policy_id ORDER BY retrievals DESC LIMIT ${limit}`);
  return rows.map((r) => ({ policyId: String(r.policy_id), title: String(r.title), retrievals: Number(r.retrievals) }));
}

export interface NegativeFeedback {
  question: string;
  comment: string | null;
  createdAt: Date;
}

export async function getLatestNegativeFeedback(limit = 10): Promise<NegativeFeedback[]> {
  const rows = await getDb().execute(sql`
    SELECT q.question_redacted AS question, f.comment_redacted AS comment, f.created_at AS created_at
    FROM feedback f JOIN query_logs q ON q.id = f.query_log_id
    WHERE f.rating = -1 ORDER BY f.created_at DESC LIMIT ${limit}`);
  return rows.map((r) => ({
    question: String(r.question),
    comment: r.comment ? String(r.comment) : null,
    createdAt: new Date(r.created_at as string),
  }));
}
