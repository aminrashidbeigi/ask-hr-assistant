import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { feedback, queryLogs } from "@/lib/db/schema";
import { logger } from "@/lib/observability/logger";
import { sendTraceScore } from "@/lib/observability/langfuse";
import { redactPII } from "@/lib/safety/pii";
import { checkRateLimit, clientIp } from "@/lib/safety/ratelimit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  queryLogId: z.string().uuid(),
  rating: z.union([z.literal(1), z.literal(-1)]),
  comment: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  const rl = await checkRateLimit(`feedback:${clientIp(req.headers)}`);
  if (!rl.success) {
    return Response.json({ error: "rate_limited", message: "Too many requests." }, { status: 429 });
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  const { queryLogId, rating, comment } = parsed.data;

  const db = getDb();
  const [row] = await db
    .select({ traceId: queryLogs.traceId })
    .from(queryLogs)
    .where(eq(queryLogs.id, queryLogId))
    .limit(1);
  if (!row) return Response.json({ error: "unknown_query" }, { status: 404 });

  const commentRedacted = comment ? redactPII(comment) : null;
  await db.insert(feedback).values({ queryLogId, rating, commentRedacted });

  let scoreSent = false;
  if (row.traceId) {
    scoreSent = await sendTraceScore({
      traceId: row.traceId,
      name: "user-feedback",
      value: rating,
      comment: commentRedacted ?? undefined,
    });
  }
  logger.info({ traceId: row.traceId, rating, scoreSent }, "feedback received");
  return Response.json({ ok: true });
}
