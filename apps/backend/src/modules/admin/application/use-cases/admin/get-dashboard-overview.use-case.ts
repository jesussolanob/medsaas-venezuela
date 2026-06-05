import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../../../../infrastructure/cache/redis.constants';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
  type DashboardOverview,
} from '../../../domain/repositories/admin.repository';

const CACHE_KEY = 'admin:dashboard:overview';
const CACHE_TTL_SECONDS = 120;

/**
 * Returns supplemental KPIs for the admin home dashboard:
 *   - appointmentsToday / appointmentsThisMonth
 *   - activeSubscriptions / trialSubscriptions
 *   - recentDoctors (top 5 by created_at desc)
 *
 * Cached in Redis (TTL 120s) with graceful fallback to DB.
 *
 * These KPIs complement GET /api/admin/dashboard without duplicating its fields.
 */
@Injectable()
export class GetDashboardOverviewUseCase {
  private readonly logger = new Logger(GetDashboardOverviewUseCase.name);

  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: IAdminRepository,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  async execute(): Promise<DashboardOverview> {
    // Try cache first — fail open if Redis is down
    try {
      const cached = await this.redis.get(CACHE_KEY);
      if (cached) {
        return JSON.parse(cached) as DashboardOverview;
      }
    } catch (err) {
      this.logger.warn('Redis unavailable — fetching dashboard overview from DB', err);
    }

    const data = await this.adminRepo.getDashboardOverview();

    // Best-effort cache write
    try {
      await this.redis.set(CACHE_KEY, JSON.stringify(data), 'EX', CACHE_TTL_SECONDS);
    } catch (err) {
      this.logger.warn('Redis unavailable — dashboard overview response will not be cached', err);
    }

    return data;
  }
}
