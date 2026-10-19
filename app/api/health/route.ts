import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const version = (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_SHA ?? "dev").slice(0, 7);
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    const [ext] = await db.execute(sql`SELECT 1 AS present FROM pg_extension WHERE extname = 'vector'`);
    const [row] = await db.execute(sql`SELECT count(*)::int AS chunks FROM chunks`);
    const chunks = Number(row?.chunks ?? 0);
    const healthy = Boolean(ext) && chunks > 0;
    return NextResponse.json(
      { status: healthy ? "ok" : "unhealthy", db: "up", pgvector: Boolean(ext), chunks, version },
      { status: healthy ? 200 : 503 },
    );
  } catch {
    return NextResponse.json(
      { status: "unhealthy", db: "down", pgvector: false, chunks: 0, version },
      { status: 503 },
    );
  }
}
