import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import {
  PLAN_FEATURES_REPOSITORY,
  type IPlanFeaturesRepository,
  type PlanFeature,
} from '../../../domain/repositories/plan-features.repository';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../domain/repositories/doctor-profile.repository';
import { DoctorProfileNotFoundError } from '../../../domain/errors/doctor-profile-not-found.error';
import { REDIS_CLIENT } from '../../../../../infrastructure/cache/redis.constants';

/** Cache TTL for plan features: 1 hour. */
const FEATURES_CACHE_TTL = 3600;

export interface DoctorFeaturesOutput {
  plan: string;
  features: PlanFeature[];
}

@Injectable()
export class GetDoctorFeaturesUseCase {
  constructor(
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly profileRepo: IDoctorProfileRepository,
    @Inject(PLAN_FEATURES_REPOSITORY)
    private readonly featuresRepo: IPlanFeaturesRepository,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  async execute(doctorId: string): Promise<DoctorFeaturesOutput> {
    const profile = await this.profileRepo.findByDoctorId(doctorId);
    if (!profile) throw new DoctorProfileNotFoundError(doctorId);

    const plan = profile.plan ?? 'trial';
    const cacheKey = `features:${plan}`;

    // 1. Try Redis cache — treat any Redis connection error as a cache miss
    //    so the endpoint degrades gracefully when Redis is unavailable.
    let cached: string | null = null;
    try {
      cached = await this.redis.get(cacheKey);
    } catch {
      // Redis unavailable — proceed to DB
    }

    if (cached !== null) {
      try {
        const parsed = JSON.parse(cached) as PlanFeature[];
        return { plan, features: parsed };
      } catch {
        // Corrupted cache entry — fall through to DB
      }
    }

    // 2. Query plan_features table
    const features = await this.featuresRepo.findByPlan(plan);

    // 3. Cache the result — failure here is non-critical; the response is still valid.
    try {
      await this.redis.setex(cacheKey, FEATURES_CACHE_TTL, JSON.stringify(features));
    } catch {
      // Redis unavailable — response continues unaffected
    }

    return { plan, features };
  }
}
