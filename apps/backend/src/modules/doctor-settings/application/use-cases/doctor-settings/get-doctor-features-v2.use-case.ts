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
import {
  PLAN_CONFIG_REPOSITORY,
  type IPlanConfigRepository,
} from '../../../domain/repositories/plan-config.repository';
import { DoctorProfileNotFoundError } from '../../../domain/errors/doctor-profile-not-found.error';
import { REDIS_CLIENT } from '../../../../../infrastructure/cache/redis.constants';

/** Cache TTL for plan features: 1 hour (same as original use case). */
const FEATURES_CACHE_TTL = 3600;

/** Default fallback role for doctors. */
const DOCTOR_ROLE = 'doctor';

export interface DoctorFeaturesV2Output {
  /** The plan key stored on the doctor's subscription. */
  plan_key: string;
  /**
   * The effective plan key after lazy-downgrade resolution.
   * Equals plan_key when the subscription is valid;
   * equals the permanent plan when it has expired.
   */
  effective_plan_key: string;
  /** True when the subscription expired and the plan was downgraded to the permanent plan. */
  is_downgraded: boolean;
  /** Feature map: featureKey → enabled (boolean). */
  features: Record<string, boolean>;
}

@Injectable()
export class GetDoctorFeaturesV2UseCase {
  constructor(
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly profileRepo: IDoctorProfileRepository,
    @Inject(PLAN_FEATURES_REPOSITORY)
    private readonly featuresRepo: IPlanFeaturesRepository,
    @Inject(PLAN_CONFIG_REPOSITORY)
    private readonly planConfigRepo: IPlanConfigRepository,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  async execute(doctorId: string): Promise<DoctorFeaturesV2Output> {
    const profile = await this.profileRepo.findByDoctorId(doctorId);
    if (!profile) throw new DoctorProfileNotFoundError(doctorId);

    const storedPlan = profile.plan ?? 'delta_free';

    // Resolve effective plan with lazy downgrade
    const { effectivePlan, isDowngraded } = await this.resolveEffectivePlan(
      storedPlan,
      profile.subscriptionStatus ?? null,
    );

    // Build feature map from cache or DB
    const featureList = await this.loadFeaturesForPlan(effectivePlan);
    const features = this.toFeatureMap(featureList);

    return {
      plan_key: storedPlan,
      effective_plan_key: effectivePlan,
      is_downgraded: isDowngraded,
      features,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolves the effective plan for a doctor.
   *
   * LAZY DOWNGRADE RULES (read-only — never mutates the DB):
   *   1. If the plan config is permanent (is_permanent=true) → always active, no downgrade.
   *   2. If subscription status is 'active' or 'trial' → use the stored plan.
   *   3. Otherwise (past_due, suspended, cancelled, or unknown) → downgrade to the
   *      permanent plan of the same role.
   */
  private async resolveEffectivePlan(
    storedPlan: string,
    subscriptionStatus: string | null,
  ): Promise<{ effectivePlan: string; isDowngraded: boolean }> {
    // Check if the stored plan itself is permanent
    const planConfig = await this.loadPlanConfig(storedPlan);
    if (planConfig?.isPermanent) {
      return { effectivePlan: storedPlan, isDowngraded: false };
    }

    // Active or trial statuses → no downgrade
    const validStatuses = new Set(['active', 'trial', 'trialing']);
    if (subscriptionStatus && validStatuses.has(subscriptionStatus)) {
      return { effectivePlan: storedPlan, isDowngraded: false };
    }

    // Expired/suspended/unknown → downgrade to permanent plan for the role
    const roleKey = planConfig?.roleKey ?? DOCTOR_ROLE;
    const permanentPlan = await this.planConfigRepo.findPermanentPlanForRole(roleKey);

    // If no permanent plan is configured, fall back to 'delta_free'
    const fallbackKey = permanentPlan?.planKey ?? 'delta_free';

    return { effectivePlan: fallbackKey, isDowngraded: true };
  }

  /** Load plan config from Redis or DB. Cache miss writes back. */
  private async loadPlanConfig(
    planKey: string,
  ): Promise<{ isPermanent: boolean; roleKey: string } | null> {
    const cacheKey = `plan_config:${planKey}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached !== null) {
        try {
          return JSON.parse(cached) as { isPermanent: boolean; roleKey: string };
        } catch {
          // Corrupted cache — fall through
        }
      }
    } catch {
      // Redis unavailable — proceed to DB
    }

    const config = await this.planConfigRepo.findByKey(planKey);
    if (!config) return null;

    const dto = { isPermanent: config.isPermanent, roleKey: config.roleKey };

    try {
      await this.redis.setex(cacheKey, FEATURES_CACHE_TTL, JSON.stringify(dto));
    } catch {
      // Non-critical write failure
    }

    return dto;
  }

  /** Load feature list from Redis or DB. */
  private async loadFeaturesForPlan(planKey: string): Promise<PlanFeature[]> {
    const cacheKey = `features:${planKey}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached !== null) {
        try {
          return JSON.parse(cached) as PlanFeature[];
        } catch {
          // Corrupted cache — fall through
        }
      }
    } catch {
      // Redis unavailable — proceed to DB
    }

    const features = await this.featuresRepo.findByPlan(planKey);

    try {
      await this.redis.setex(cacheKey, FEATURES_CACHE_TTL, JSON.stringify(features));
    } catch {
      // Non-critical write failure
    }

    return features;
  }

  /** Converts a feature list to a boolean map keyed by featureKey. */
  private toFeatureMap(features: PlanFeature[]): Record<string, boolean> {
    const map: Record<string, boolean> = {};
    for (const f of features) {
      map[f.featureKey] = f.enabled;
    }
    return map;
  }
}
