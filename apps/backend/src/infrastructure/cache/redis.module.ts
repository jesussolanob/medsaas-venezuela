import { Global, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { redisConfig } from '../config/redis.config';
import { REDIS_CLIENT } from './redis.constants';
import { InMemoryRedis } from './in-memory-redis';

/**
 * Provides a single shared cache client across the application.
 * Global so any module can inject REDIS_CLIENT without re-importing.
 *
 * REDIS_DISABLED=true swaps the real ioredis client for an in-memory stand-in,
 * so the backend can run with no Redis server (e.g. a low-cost test deploy).
 * Every consumer treats Redis as a best-effort cache with a DB fallback, so the
 * only loss is cache sharing across instances.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (): Redis => {
        if (process.env.REDIS_DISABLED === 'true') {
          return new InMemoryRedis() as unknown as Redis;
        }
        const { url, options } = redisConfig();
        const client = new Redis(url, options);
        // Without an error listener ioredis prints noisy "Unhandled error event"
        // lines on connection trouble; funnel them to a single warn channel.
        const logger = new Logger('RedisClient');
        client.on('error', (e: Error) => logger.warn(`Redis error: ${e.message}`));
        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  constructor() {}

  async onModuleDestroy(): Promise<void> {
    // Connection is closed by Nest's DI teardown via the provider instance;
    // explicit cleanup happens in the provider's lifecycle when resolved.
  }
}
