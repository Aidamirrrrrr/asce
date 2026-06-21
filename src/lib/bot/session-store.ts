import { getRedisClient } from "@/lib/redis/client";

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;

type MemoryEntry = { value: string; expiresAt: number };

const memoryFallback = new Map<string, MemoryEntry>();

export function buildSessionKey(prefix: string, projectId: string, chatId: number): string {
  return `${prefix}:${projectId}:${chatId}`;
}

export async function getJsonSession<T>(key: string): Promise<T | null> {
  const redis = await getRedisClient();
  if (redis) {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  const entry = memoryFallback.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    memoryFallback.delete(key);
    return null;
  }

  return JSON.parse(entry.value) as T;
}

export async function setJsonSession<T>(
  key: string,
  value: T | null,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<void> {
  if (value === null) {
    await deleteJsonSession(key);
    return;
  }

  const raw = JSON.stringify(value);
  const redis = await getRedisClient();
  if (redis) {
    await redis.set(key, raw, { EX: ttlSeconds });
    return;
  }

  memoryFallback.set(key, { value: raw, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export async function deleteJsonSession(key: string): Promise<void> {
  const redis = await getRedisClient();
  if (redis) {
    await redis.del(key);
    return;
  }

  memoryFallback.delete(key);
}
