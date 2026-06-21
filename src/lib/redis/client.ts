import { createClient, type RedisClientType } from "redis";

import { logger } from "@/lib/logger";

let client: RedisClientType | undefined;
let connectPromise: Promise<RedisClientType | null> | undefined;

export async function getRedisClient(): Promise<RedisClientType | null> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    return null;
  }

  if (!connectPromise) {
    connectPromise = (async () => {
      const redis: RedisClientType = createClient({
        url,
        socket: {
          // Railway's private network (*.railway.internal) is IPv6-only.
          // family: 0 lets Node resolve both A and AAAA records, otherwise the
          // default IPv4 lookup fails and we silently fall back to in-memory.
          family: 0,
          reconnectStrategy: (retries) => Math.min(retries * 200, 5000),
        },
      });
      redis.on("error", (error) => {
        logger.error("redis_client_error", { message: error.message });
      });
      redis.on("ready", () => {
        logger.info("redis_ready", {});
      });
      await redis.connect();
      client = redis;
      logger.info("redis_connected", {});
      return redis;
    })().catch((error) => {
      connectPromise = undefined;
      logger.error("redis_connect_failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
      return null;
    });
  }

  return connectPromise;
}

export async function closeRedisClient(): Promise<void> {
  if (client?.isOpen) {
    await client.quit();
  }
  client = undefined;
  connectPromise = undefined;
}
