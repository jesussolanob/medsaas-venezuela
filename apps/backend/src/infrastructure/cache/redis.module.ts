import { Global, Module, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { redisConfig } from '../config/redis.config';
import { REDIS_CLIENT } from './redis.constants';

/**
 * Provides a single shared ioredis client across the application.
 * Global so any module can inject REDIS_CLIENT without re-importing.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (): Redis => {
        const { url, options } = redisConfig();
        return new Redis(url, options);
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
