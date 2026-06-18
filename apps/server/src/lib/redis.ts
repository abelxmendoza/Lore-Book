import { createClient, type RedisClientType } from 'redis';

import { logger } from '../logger';

let client: RedisClientType | null = null;
let connectPromise: Promise<RedisClientType | null> | null = null;
let failed = false;

export const isRedisConfigured = (): boolean => Boolean(process.env.REDIS_URL);

export async function getRedisClient(): Promise<RedisClientType | null> {
  if (!isRedisConfigured() || failed) return null;
  if (client?.isOpen) return client;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    try {
      const nextClient = createClient({ url: process.env.REDIS_URL });
      nextClient.on('error', (error) => {
        logger.warn({ error }, 'Redis client error; falling back to in-memory state');
      });
      await nextClient.connect();
      client = nextClient as RedisClientType;
      logger.info('Redis connected for shared security state');
      return client;
    } catch (error) {
      failed = true;
      logger.warn({ error }, 'Redis unavailable; falling back to in-memory state');
      return null;
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
}

export async function closeRedisClient(): Promise<void> {
  if (!client) return;
  const closing = client;
  client = null;
  if (closing.isOpen) {
    await closing.quit();
  }
}
