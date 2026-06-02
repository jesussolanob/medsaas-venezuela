import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../../../../infrastructure/cache/redis.constants';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
} from '../../../domain/repositories/admin.repository';

export interface AdminDashboardOutput {
  totalDoctors: number;
  activeDoctors: number;
  coldDoctors: number;
  inactiveDoctors: number;
  appointmentsLast30Days: number;
  totalPatients: number;
  expiringSubscriptionsCount: number;
}

const CACHE_KEY = 'admin:dashboard';
const CACHE_TTL_SECONDS = 300;

/**
 * Returns KPI data for the admin dashboard.
 *
 * Cached in Redis with a 300-second TTL. Cache is invalidated by
 * UpdateDoctorSubscriptionUseCase when a subscription changes.
 *
 * Redis failures are handled gracefully: if the cache read fails, the use case
 * falls through to the database. If the cache write fails, the data is returned
 * uncached and Redis recovers on the next write cycle.
 *
 * Activity breakdown (active/cold/inactive) is always 0/0/total in Etapa 1
 * because lastSignInAt tracking requires Fase 4 (Auth0 integration).
 */
@Injectable()
export class GetAdminDashboardUseCase {
  private readonly logger = new Logger(GetAdminDashboardUseCase.name);

  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: IAdminRepository,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  async execute(): Promise<AdminDashboardOutput> {
    // Try cache first — fail open if Redis is down
    try {
      const cached = await this.redis.get(CACHE_KEY);
      if (cached) {
        return JSON.parse(cached) as AdminDashboardOutput;
      }
    } catch (err) {
      this.logger.warn('Redis unavailable — fetching dashboard from DB', err);
    }

    const data = await this.adminRepo.getDashboardData();

    // Best-effort cache write — do not let a Redis failure block the response
    try {
      await this.redis.set(CACHE_KEY, JSON.stringify(data), 'EX', CACHE_TTL_SECONDS);
    } catch (err) {
      this.logger.warn('Redis unavailable — dashboard response will not be cached', err);
    }

    return data;
  }
}
