import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../../../../infrastructure/cache/redis.constants';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
  type PlanFeatureRow,
} from '../../../domain/repositories/admin.repository';

export interface TogglePlanFeatureInput {
  planKey: string;
  featureKey: string;
  featureLabel: string;
  enabled: boolean;
}

/**
 * Enables or disables a specific feature for a plan.
 *
 * Uses upsert semantics: if the (plan, featureKey) pair does not exist it is
 * created; if it does, the enabled flag and label are updated.
 *
 * After the upsert, the features cache key for the plan is invalidated so the
 * next request returns fresh data. Cache invalidation is best-effort: if Redis
 * is down the invalidation is skipped and the stale cache will expire at its TTL.
 *
 * Cache key pattern: features:{planKey}
 */
@Injectable()
export class TogglePlanFeatureUseCase {
  private readonly logger = new Logger(TogglePlanFeatureUseCase.name);

  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: IAdminRepository,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  async execute(input: TogglePlanFeatureInput): Promise<PlanFeatureRow> {
    const result = await this.adminRepo.upsertPlanFeature(
      input.planKey,
      input.featureKey,
      input.featureLabel,
      input.enabled,
    );

    // Best-effort cache invalidation — do not let a Redis failure block the response
    try {
      await this.redis.del(`features:${input.planKey}`);
    } catch (err) {
      this.logger.warn(
        `Redis unavailable — features:${input.planKey} cache will expire naturally`,
        err,
      );
    }

    return result;
  }
}
