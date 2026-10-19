import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __sql?: postgres.Sql; __db?: Db };

/** Lazily created so importing this module never needs DATABASE_URL (build, unit tests). */
export function getSql(): postgres.Sql {
  if (!globalForDb.__sql) {
    globalForDb.__sql = postgres(getEnv().DATABASE_URL, {
      max: process.env.VERCEL ? 1 : 5,
      idle_timeout: 20,
      prepare: false, // required for Neon's pooled (pgbouncer) connections
    });
  }
  return globalForDb.__sql;
}

export function getDb(): Db {
  if (!globalForDb.__db) globalForDb.__db = drizzle(getSql(), { schema });
  return globalForDb.__db;
}

export async function closeDb() {
  await globalForDb.__sql?.end({ timeout: 5 });
  globalForDb.__sql = undefined;
  globalForDb.__db = undefined;
}

export { schema };
