import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { InjectModel } from '@nestjs/sequelize';
import { REDIS_CLIENT } from '../../../../../infrastructure/cache/redis.constants';
import type { IUsdtRateStore } from '../../../domain/repositories/usdt-rate.store';
import { AppSettingModel } from '../models/app-setting.model';

/** Redis key for the cached USDT/BS rate. */
const REDIS_KEY = 'usdt_rate';
/** TTL in seconds: 10 minutes. */
const CACHE_TTL_SECONDS = 600;
/** app_settings row key for the persistent rate. */
const SETTINGS_KEY = 'usdt_rate';

/**
 * IUsdtRateStore implementation that layers a Redis cache over app_settings.
 *
 * Read path:  Redis → app_settings → null
 * Write path: app_settings UPSERT → Redis SET (overwrite, TTL 600 s)
 *
 * NaN guard: if the Redis-cached value or the app_settings value cannot be parsed
 * as a valid finite number, that source is treated as a cache miss and the next
 * fallback is tried. NaN is never returned to callers.
 */
@Injectable()
export class RedisUsdtRateStore implements IUsdtRateStore {
  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    @InjectModel(AppSettingModel)
    private readonly settingModel: typeof AppSettingModel,
  ) {}

  async getRate(): Promise<number | null> {
    // 1. Try Redis cache.
    const cached = await this.redis.get(REDIS_KEY);
    if (cached !== null) {
      const parsed = parseFloat(cached);
      if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
        return parsed;
      }
      // Cached value is corrupted — fall through to app_settings.
    }

    // 2. Fall back to persistent store.
    const row = await this.settingModel.findByPk(SETTINGS_KEY);
    if (!row) return null;

    const rate = parseFloat(row.value);
    if (Number.isNaN(rate) || !Number.isFinite(rate)) {
      // app_settings value is also invalid — return null rather than NaN.
      return null;
    }

    // Warm the cache with the validated value.
    await this.redis.setex(REDIS_KEY, CACHE_TTL_SECONDS, row.value);
    return rate;
  }

  async setRate(rate: number): Promise<void> {
    const value = rate.toString();
    await this.settingModel.upsert({ key: SETTINGS_KEY, value });
    await this.redis.setex(REDIS_KEY, CACHE_TTL_SECONDS, value);
  }
}
