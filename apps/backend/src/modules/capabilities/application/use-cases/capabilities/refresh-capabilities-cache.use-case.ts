import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../../../../infrastructure/cache/redis.constants';

/**
 * Flushes ALL cached role capabilities (`capabilities:*`) from Redis.
 *
 * Escape hatch for out-of-band changes to `role_capabilities` (manual SQL, scripts,
 * migrations) that bypass the PUT endpoint and therefore never trigger per-role
 * invalidation. After a flush the next read of each role repopulates from the DB.
 *
 * Uses SCAN + DEL (NEVER KEYS, which blocks Redis). Best-effort: if Redis is
 * unavailable the call degrades to a no-op (the TTL of 300 s is the safety net).
 *
 * Returns the number of keys deleted.
 */
@Injectable()
export class RefreshCapabilitiesCacheUseCase {
  private readonly logger = new Logger(RefreshCapabilitiesCacheUseCase.name);

  private static readonly PATTERN = 'capabilities:*';
  private static readonly SCAN_COUNT = 100;

  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  async execute(): Promise<{ keysDeleted: number }> {
    let deleted = 0;
    try {
      let cursor = '0';
      do {
        const [next, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          RefreshCapabilitiesCacheUseCase.PATTERN,
          'COUNT',
          RefreshCapabilitiesCacheUseCase.SCAN_COUNT,
        );
        cursor = next;
        if (keys.length > 0) {
          deleted += await this.redis.del(...keys);
        }
      } while (cursor !== '0');
    } catch (err) {
      this.logger.warn(
        'Redis unavailable — capabilities cache will expire naturally at its TTL',
        err,
      );
      return { keysDeleted: 0 };
    }

    return { keysDeleted: deleted };
  }
}
