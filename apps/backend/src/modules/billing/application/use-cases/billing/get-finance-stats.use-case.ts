import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../../../../infrastructure/cache/redis.constants';
import {
  SUBSCRIPTION_PAYMENT_REPOSITORY,
  type ISubscriptionPaymentRepository,
  type FinanceStats,
} from '../../../domain/repositories/subscription-payment.repository';

const CACHE_KEY = 'admin:finance-stats';
const CACHE_TTL_SECONDS = 120;

/**
 * Returns aggregated finance KPIs from subscription_payments for the admin finance page.
 *
 * Redis cache (TTL 120s) with graceful fallback to DB when Redis is unavailable.
 *
 * SECURITY: Output includes doctor name/specialty (doctor PII). This use case
 * must only be called from super_admin-guarded endpoints.
 */
@Injectable()
export class GetFinanceStatsUseCase {
  private readonly logger = new Logger(GetFinanceStatsUseCase.name);

  constructor(
    @Inject(SUBSCRIPTION_PAYMENT_REPOSITORY)
    private readonly repo: ISubscriptionPaymentRepository,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  async execute(): Promise<FinanceStats> {
    // Try cache first — fail open if Redis is down
    try {
      const cached = await this.redis.get(CACHE_KEY);
      if (cached) {
        return JSON.parse(cached) as FinanceStats;
      }
    } catch (err) {
      this.logger.warn('Redis unavailable — fetching finance stats from DB', err);
    }

    const data = await this.repo.getFinanceStats();

    // Best-effort cache write
    try {
      await this.redis.set(CACHE_KEY, JSON.stringify(data), 'EX', CACHE_TTL_SECONDS);
    } catch (err) {
      this.logger.warn('Redis unavailable — finance stats response will not be cached', err);
    }

    return data;
  }
}
