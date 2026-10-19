import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { getEnv } from "@/lib/env";
import { queryLogs } from "@/lib/db/schema";
import { logger } from "@/lib/observability/logger";

export type NewQueryLog = typeof queryLogs.$inferInsert;

/** Never throws: a failing log write must not break (or hide) a chat answer. */
export async function insertQueryLog(row: NewQueryLog): Promise<void> {
  try {
    await getDb().insert(queryLogs).values(row);
  } catch (err) {
    logger.error({ err: String(err), traceId: row.traceId }, "failed to write query_logs row");
  }
}

/** Sum of today's (UTC) estimated cost. */
export async function getTodaySpendUsd(): Promise<number> {
  const [row] = await getDb().execute(
    sql`SELECT COALESCE(SUM(cost_usd), 0)::float8 AS spend FROM query_logs WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc'`,
  );
  return Number(row?.spend ?? 0);
}

export type BudgetState = "ok" | "warning" | "exhausted";

export function budgetState(spend: number, budget = getEnv().DAILY_BUDGET_USD): BudgetState {
  if (spend >= budget) return "exhausted";
  if (spend >= budget * 0.8) return "warning";
  return "ok";
}
