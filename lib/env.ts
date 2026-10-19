import { z } from "zod";

// Empty strings (as in .env.example) count as "unset".
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema.optional());

const schema = z.object({
  OPENAI_API_KEY: optional(z.string()),
  CHAT_MODEL: z.string().default("gpt-4o-mini"),
  JUDGE_MODEL: z.string().default("gpt-4o"),
  EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  EMBEDDING_PROVIDER: z.enum(["openai", "mock"]).default("openai"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_URL_UNPOOLED: optional(z.string()),
  RETRIEVAL_MODE: z.enum(["hybrid", "vector"]).default("hybrid"),
  MIN_RELEVANCE: z.coerce.number().default(0),
  TOP_K: z.coerce.number().int().positive().default(6),
  LANGFUSE_PUBLIC_KEY: optional(z.string()),
  LANGFUSE_SECRET_KEY: optional(z.string()),
  LANGFUSE_BASEURL: optional(z.string().url()),
  UPSTASH_REDIS_REST_URL: optional(z.string().url()),
  UPSTASH_REDIS_REST_TOKEN: optional(z.string()),
  ADMIN_USER: optional(z.string()),
  ADMIN_PASSWORD: optional(z.string()),
  DAILY_BUDGET_USD: z.coerce.number().positive().default(2),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Lazily parsed so `next build` and unit tests don't need a full environment. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const envSchema = schema;
