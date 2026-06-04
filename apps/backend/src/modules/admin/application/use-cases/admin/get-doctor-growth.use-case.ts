import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../../../../infrastructure/cache/redis.constants';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
  type DoctorGrowthData,
} from '../../../domain/repositories/admin.repository';

const CACHE_KEY = 'admin:doctor-growth';
const CACHE_TTL_SECONDS = 300;

/**
 * Returns doctor registration growth data for the last 6 calendar months.
 *
 * Cached in Redis with a 300-second TTL. Redis failures are handled
 * gracefully — if the cache read or write fails, the use case falls through
 * to the database and the response is still returned uncached.
 */
@Injectable()
export class GetDoctorGrowthUseCase {
  private readonly logger = new Logger(GetDoctorGrowthUseCase.name);

  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: IAdminRepository,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  async execute(): Promise<DoctorGrowthData> {
    // Try cache first — fail open if Redis is down
    try {
      const cached = await this.redis.get(CACHE_KEY);
      if (cached) {
        return JSON.parse(cached) as DoctorGrowthData;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Redis unavailable — fetching doctor growth from DB: ${msg}`);
    }

    const data = await this.adminRepo.getDoctorGrowth();

    // Best-effort cache write — do not let a Redis failure block the response
    try {
      await this.redis.set(CACHE_KEY, JSON.stringify(data), 'EX', CACHE_TTL_SECONDS);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Redis unavailable — doctor growth response will not be cached: ${msg}`);
    }

    return data;
  }
}
