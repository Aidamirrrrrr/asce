import { randomUUID } from "node:crypto";

import { logger } from "@/lib/logger";
import { getRedisClient } from "@/lib/redis/client";

/**
 * Распределённый лок «один поллер на бота» поверх Redis.
 *
 * Файловый worker-lock защищает только от двух процессов на одной машине.
 * На Railway во время передеплоя старый и новый контейнер какое-то время
 * живут одновременно — оба держат getUpdates по одному токену и ловят 409.
 * Этот лок гарантирует, что long polling по проекту ведёт ровно один процесс,
 * независимо от контейнеров и реплик.
 */

const LOCK_PREFIX = "bot:poll:lock:";
const LOCK_TTL_MS = 30_000;
const HEARTBEAT_MS = 10_000;

// Снимаем лок только если он всё ещё наш (значение совпадает) — иначе можно
// удалить чужой лок, перехваченный после истечения TTL.
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

// Продлеваем TTL только пока лок наш.
const RENEW_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end`;

export type PollingLock = {
  release: () => Promise<void>;
};

export async function acquirePollingLock(projectId: string): Promise<PollingLock | null> {
  const redis = await getRedisClient();

  // Без Redis координировать нельзя — считаем, что инстанс один, и не мешаем
  // поллингу (поведение как до лока). release становится no-op.
  if (!redis) {
    return { release: async () => {} };
  }

  const key = `${LOCK_PREFIX}${projectId}`;
  const token = randomUUID();

  let acquired: string | null;
  try {
    acquired = await redis.set(key, token, { NX: true, PX: LOCK_TTL_MS });
  } catch (error) {
    // Redis недоступен в моменте — не блокируем поллинг.
    logger.warn("poll_lock_acquire_failed", {
      projectId,
      message: error instanceof Error ? error.message : "unknown",
    });
    return { release: async () => {} };
  }

  if (acquired !== "OK") {
    return null;
  }

  const heartbeat = setInterval(() => {
    void redis
      .eval(RENEW_SCRIPT, { keys: [key], arguments: [token, String(LOCK_TTL_MS)] })
      .catch((error) => {
        logger.warn("poll_lock_renew_failed", {
          projectId,
          message: error instanceof Error ? error.message : "unknown",
        });
      });
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  let released = false;
  return {
    release: async () => {
      if (released) {
        return;
      }
      released = true;
      clearInterval(heartbeat);
      try {
        await redis.eval(RELEASE_SCRIPT, { keys: [key], arguments: [token] });
      } catch {
        // Лок сам истечёт по TTL.
      }
    },
  };
}
