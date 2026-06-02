import type { RedisOptions } from 'ioredis';

/**
 * Parses REDIS_URL into ioredis connection options.
 * Falls back to the local Docker defaults when the variable is absent.
 */
export const redisConfig = (): { url: string; options: RedisOptions } => ({
  url: process.env.REDIS_URL ?? 'redis://:redis_dev_password@localhost:6379',
  options: {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  },
});
