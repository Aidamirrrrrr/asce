import { getRedisClient } from "@/lib/redis/client";

type MemoryBucket = { count: number; resetAt: number };

const memoryBuckets = new Map<string, MemoryBucket>();

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds?: number;
};

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const redis = await getRedisClient();
  if (redis) {
    try {
      const bucketKey = `ratelimit:${key}`;
      const count = await redis.incr(bucketKey);
      // Always make sure the bucket has a TTL. If the very first expire was ever
      // lost, the counter would grow forever and permanently 429 — even across
      // restarts, since the key lives in Redis. Re-arm the TTL whenever missing.
      if (count === 1) {
        await redis.expire(bucketKey, windowSeconds);
      } else {
        const ttl = await redis.ttl(bucketKey);
        if (ttl < 0) {
          await redis.expire(bucketKey, windowSeconds);
        }
      }

      if (count > limit) {
        const ttl = await redis.ttl(bucketKey);
        return { allowed: false, retryAfterSeconds: Math.max(ttl, 1) };
      }

      return { allowed: true };
    } catch {
      // Never let a rate-limiter hiccup block real traffic — fail open.
      return { allowed: true };
    }
  }

  const now = Date.now();
  const bucket = memoryBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  return { allowed: true };
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function enforceRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  return checkRateLimit(key, limit, windowSeconds);
}
