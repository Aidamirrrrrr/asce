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
      const redis = createClient({ url });
      redis.on("error", (error) => {
        logger.error("redis_client_error", { message: error.message });
      });
      await redis.connect();
      client = redis;
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
