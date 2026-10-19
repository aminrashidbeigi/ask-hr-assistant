import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { getEnv } from "@/lib/env";

export const RATE_LIMIT = 20;
export const RATE_WINDOW_MS = 10 * 60 * 1000;

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  /** ms until the oldest counted request leaves the window */
  retryAfterMs: number;
}

export interface Limiter {
  limit(key: string): Promise<RateLimitResult>;
}

/** Sliding-window-log limiter held in process memory (fallback when Upstash is not configured). */
export function createMemoryLimiter(
  limit = RATE_LIMIT,
  windowMs = RATE_WINDOW_MS,
  now: () => number = Date.now,
): Limiter {
  const hits = new Map<string, number[]>();
  return {
    async limit(key) {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((ts) => t - ts < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return { success: false, remaining: 0, retryAfterMs: windowMs - (t - recent[0]) };
      }
      recent.push(t);
      hits.set(key, recent);
      // keep the map from growing without bound
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (v.every((ts) => t - ts >= windowMs)) hits.delete(k);
      }
      return { success: true, remaining: limit - recent.length, retryAfterMs: 0 };
    },
  };
}

function createUpstashLimiter(url: string, token: string): Limiter {
  const ratelimit = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(RATE_LIMIT, "10 m"),
    prefix: "askhr",
  });
  return {
    async limit(key) {
      const r = await ratelimit.limit(key);
      return {
        success: r.success,
        remaining: r.remaining,
        retryAfterMs: Math.max(0, r.reset - Date.now()),
      };
    },
  };
}

const globalForLimiter = globalThis as unknown as { __limiter?: Limiter };

function getLimiter(): Limiter {
  if (!globalForLimiter.__limiter) {
    const env = getEnv();
    globalForLimiter.__limiter =
      env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
        ? createUpstashLimiter(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN)
        : createMemoryLimiter();
  }
  return globalForLimiter.__limiter;
}

export async function checkRateLimit(key: string): Promise<RateLimitResult> {
  try {
    return await getLimiter().limit(key);
  } catch {
    // If Redis is down, fail open rather than taking the assistant offline.
    return { success: true, remaining: RATE_LIMIT, retryAfterMs: 0 };
  }
}

export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}
