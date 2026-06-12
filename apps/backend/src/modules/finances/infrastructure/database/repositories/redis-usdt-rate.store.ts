import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { InjectModel } from '@nestjs/sequelize';
import { REDIS_CLIENT } from '../../../../../infrastructure/cache/redis.constants';
import type {
  IUsdtRateStore,
  RatesSummary,
  RateSource,
} from '../../../domain/repositories/usdt-rate.store';
import {
  BINANCE_RATE_FETCHER,
  BCV_RATE_FETCHER,
  type IBinanceRateFetcher,
  type IBcvRateFetcher,
} from '../../../domain/repositories/rate-fetcher.ports';
import { AppSettingModel } from '../models/app-setting.model';

/** Redis key for the cached effective USDT/BS rate. */
const REDIS_KEY = 'usdt_rate';
/** TTL in seconds: 10 minutes. */
const CACHE_TTL_SECONDS = 600;

// ─── app_settings keys ──────────────────────────────────────────────────────
const KEY_EFFECTIVE = 'usdt_rate';
const KEY_SOURCE = 'rate_source';
const KEY_BINANCE = 'usdt_binance_rate';
const KEY_BCV = 'usdt_bcv_rate';

const DEFAULT_SOURCE: RateSource = 'binance';

/**
 * IUsdtRateStore implementation.
 *
 * Read path (manual):   Redis `usdt_rate` → app_settings `usdt_rate` → null
 * Read path (binance/bcv):
 *   Redis hit  → return cached
 *   Redis miss → fetch from active source
 *               → success: persist (Redis + app_settings usdt_rate + per-source key) → return
 *               → fail:    try other source as last resort → fallback to app_settings usdt_rate → null
 *
 * Write path (setRate): sets rate_source='manual', persists to app_settings + Redis.
 * Write path (setSource): changes rate_source; if 'binance'/'bcv', immediately fetches+persists.
 *
 * NaN guard: any value that is not a finite positive number is treated as a miss.
 */
@Injectable()
export class RedisUsdtRateStore implements IUsdtRateStore {
  private readonly logger = new Logger(RedisUsdtRateStore.name);

  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    @InjectModel(AppSettingModel)
    private readonly settingModel: typeof AppSettingModel,
    @Inject(BINANCE_RATE_FETCHER)
    private readonly binanceFetcher: IBinanceRateFetcher,
    @Inject(BCV_RATE_FETCHER)
    private readonly bcvFetcher: IBcvRateFetcher,
  ) {}

  // ─── Public interface ────────────────────────────────────────────────────

  async getRate(): Promise<number | null> {
    const source = await this.readSource();

    if (source === 'manual') {
      return this.getManualRate();
    }

    // binance or bcv: try Redis first.
    const cached = await this.readRedisRate();
    if (cached !== null) return cached;

    // Cache miss: fetch from active source.
    const fetched = await this.fetchFromSource(source);
    if (fetched !== null) {
      await this.persistEffectiveRate(fetched);
      await this.persistPerSourceRate(source, fetched);
      return fetched;
    }

    // Active source failed: try the other source as last resort.
    const otherSource: RateSource = source === 'binance' ? 'bcv' : 'binance';
    this.logger.warn(
      `Rate source "${source}" fetch failed; trying fallback source "${otherSource}"`,
    );
    const fallbackFetched = await this.fetchFromSource(otherSource);
    if (fallbackFetched !== null) {
      // Persist but do NOT change the configured source.
      await this.persistEffectiveRate(fallbackFetched);
      await this.persistPerSourceRate(otherSource, fallbackFetched);
      return fallbackFetched;
    }

    // Both sources failed: return last-good from app_settings.
    const lastGood = await this.readSettingRate(KEY_EFFECTIVE);
    if (lastGood !== null) {
      this.logger.warn('All fetchers failed; returning last-known effective rate');
    }
    return lastGood;
  }

  async setRate(rate: number): Promise<void> {
    // Setting a manual rate also switches source to manual.
    await this.writeSetting(KEY_SOURCE, 'manual');
    await this.persistEffectiveRate(rate);
  }

  async setSource(source: RateSource, manualValue?: number): Promise<number | null> {
    await this.writeSetting(KEY_SOURCE, source);

    if (source === 'manual') {
      if (manualValue != null && manualValue > 0) {
        await this.persistEffectiveRate(manualValue);
        return manualValue;
      }
      // No value provided: return the current stored rate.
      return this.readSettingRate(KEY_EFFECTIVE);
    }

    // binance or bcv: immediately fetch and persist.
    const fetched = await this.fetchFromSource(source);
    if (fetched !== null) {
      await this.persistEffectiveRate(fetched);
      await this.persistPerSourceRate(source, fetched);
      return fetched;
    }

    // Fetch failed: return whatever was last persisted.
    this.logger.warn(`Immediate fetch for source "${source}" failed; returning last known rate`);
    return this.readSettingRate(KEY_EFFECTIVE);
  }

  async getRatesSummary(): Promise<RatesSummary> {
    const [source, effective, binance, bcv] = await Promise.all([
      this.readSource(),
      this.readSettingRate(KEY_EFFECTIVE),
      this.readSettingRate(KEY_BINANCE),
      this.readSettingRate(KEY_BCV),
    ]);

    return { source, manual: source === 'manual' ? effective : null, binance, bcv, effective };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private async readSource(): Promise<RateSource> {
    try {
      const row = await this.settingModel.findByPk(KEY_SOURCE);
      const val = row?.value ?? DEFAULT_SOURCE;
      if (val === 'binance' || val === 'bcv' || val === 'manual') return val;
      return DEFAULT_SOURCE;
    } catch (err: unknown) {
      this.logger.error(`Failed to read rate_source: ${String(err)}`);
      return DEFAULT_SOURCE;
    }
  }

  private async getManualRate(): Promise<number | null> {
    // Manual path: Redis → app_settings.
    const cached = await this.readRedisRate();
    if (cached !== null) return cached;

    const persisted = await this.readSettingRate(KEY_EFFECTIVE);
    if (persisted !== null) {
      // Warm the Redis cache.
      await this.redis.setex(REDIS_KEY, CACHE_TTL_SECONDS, persisted.toString());
    }
    return persisted;
  }

  private async readRedisRate(): Promise<number | null> {
    try {
      const cached = await this.redis.get(REDIS_KEY);
      if (cached === null) return null;
      const parsed = parseFloat(cached);
      if (!Number.isFinite(parsed) || parsed <= 0) return null;
      return parsed;
    } catch (err: unknown) {
      this.logger.warn(`Redis read failed: ${String(err)}`);
      return null;
    }
  }

  private async readSettingRate(key: string): Promise<number | null> {
    try {
      const row = await this.settingModel.findByPk(key);
      if (!row) return null;
      const parsed = parseFloat(row.value);
      if (!Number.isFinite(parsed) || parsed <= 0) return null;
      return parsed;
    } catch (err: unknown) {
      this.logger.error(`Failed to read app_settings[${key}]: ${String(err)}`);
      return null;
    }
  }

  private async persistEffectiveRate(rate: number): Promise<void> {
    const value = rate.toString();
    await this.settingModel.upsert({ key: KEY_EFFECTIVE, value });
    await this.redis.setex(REDIS_KEY, CACHE_TTL_SECONDS, value);
  }

  private async persistPerSourceRate(source: RateSource, rate: number): Promise<void> {
    const key = source === 'binance' ? KEY_BINANCE : KEY_BCV;
    await this.writeSetting(key, rate.toString());
  }

  private async writeSetting(key: string, value: string): Promise<void> {
    await this.settingModel.upsert({ key, value });
  }

  private async fetchFromSource(source: RateSource): Promise<number | null> {
    if (source === 'binance') return this.binanceFetcher.fetchRate();
    if (source === 'bcv') return this.bcvFetcher.fetchRate();
    return null;
  }
}
