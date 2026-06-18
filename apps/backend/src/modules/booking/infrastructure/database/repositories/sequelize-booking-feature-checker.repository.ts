import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { IBookingFeatureChecker } from '../../../domain/repositories/booking-feature-checker.repository';
import { ProfileModel } from '../models/profile.model';
// Re-use the doctor-settings Sequelize models that map to the same DB tables.
// This avoids duplicating table definitions while keeping booking's domain
// decoupled (it only imports from infrastructure, not from doctor-settings application layer).
import { PlanConfigDoctorModel } from '../../../../doctor-settings/infrastructure/database/models/plan-config-doctor.model';
import { PlanFeaturesModel } from '../../../../doctor-settings/infrastructure/database/models/plan-features.model';

const BOOKING_FEATURE_KEY = 'booking';
const FALLBACK_PLAN = 'delta_free';
const DOCTOR_ROLE = 'doctor';
const VALID_SUBSCRIPTION_STATUSES = new Set(['active', 'trial', 'trialing']);

/**
 * Sequelize implementation of IBookingFeatureChecker.
 *
 * Resolves the effective plan for a doctor using the same lazy-downgrade logic
 * as GetDoctorFeaturesV2UseCase (doctor-settings module), then checks whether
 * the `booking` feature is enabled for that plan in plan_features.
 *
 * Source tables:
 *   - profiles           → plan, subscription_status
 *   - plan_configs       → is_permanent, role_key (for downgrade resolution)
 *   - plan_features      → enabled (for feature_key = 'booking')
 *
 * Redis caching is intentionally omitted here: the checker is called only on
 * the hot path of the public booking endpoint (GET /info and POST /booking).
 * Adding Redis would require injecting REDIS_CLIENT into BookingModule; the
 * extra DB queries are cheap (indexed lookups). If latency becomes a concern,
 * caching can be added without changing the domain interface.
 */
@Injectable()
export class SequelizeBookingFeatureChecker implements IBookingFeatureChecker {
  constructor(
    @InjectModel(ProfileModel)
    private readonly profileModel: typeof ProfileModel,
    @InjectModel(PlanConfigDoctorModel)
    private readonly planConfigModel: typeof PlanConfigDoctorModel,
    @InjectModel(PlanFeaturesModel)
    private readonly planFeaturesModel: typeof PlanFeaturesModel,
  ) {}

  async isBookingEnabled(doctorId: string): Promise<boolean> {
    const profile = await this.profileModel.findOne({
      where: { id: doctorId },
      attributes: ['plan', 'subscriptionStatus'],
    });

    if (!profile) return false;

    const storedPlan = profile.plan ?? FALLBACK_PLAN;
    const effectivePlan = await this.resolveEffectivePlan(
      storedPlan,
      profile.subscriptionStatus ?? null,
    );

    return this.isFeatureEnabledForPlan(effectivePlan, BOOKING_FEATURE_KEY);
  }

  // ---------------------------------------------------------------------------
  // Private helpers — mirrors GetDoctorFeaturesV2UseCase.resolveEffectivePlan
  // ---------------------------------------------------------------------------

  /**
   * Resolves the effective plan applying lazy-downgrade rules.
   *
   * Rules (identical to GetDoctorFeaturesV2UseCase):
   *   1. Plan config is permanent → always use stored plan (no downgrade).
   *   2. Subscription status is 'active' | 'trial' | 'trialing' → no downgrade.
   *   3. Otherwise → find the permanent plan for the doctor role and use it.
   *      Falls back to FALLBACK_PLAN ('delta_free') if none is configured.
   */
  private async resolveEffectivePlan(
    storedPlan: string,
    subscriptionStatus: string | null,
  ): Promise<string> {
    const planConfig = await this.planConfigModel.findOne({ where: { planKey: storedPlan } });

    // Rule 1: permanent plans never downgrade
    if (planConfig?.isPermanent) return storedPlan;

    // Rule 2: active/trial subscriptions keep their plan
    if (subscriptionStatus && VALID_SUBSCRIPTION_STATUSES.has(subscriptionStatus)) {
      return storedPlan;
    }

    // Rule 3: expired/unknown → fallback to the permanent plan for the doctor role
    const roleKey = planConfig?.roleKey ?? DOCTOR_ROLE;
    const permanentPlan = await this.planConfigModel.findOne({
      where: { roleKey, isPermanent: true, isActive: true },
      order: [['sortOrder', 'ASC']],
    });

    return permanentPlan?.planKey ?? FALLBACK_PLAN;
  }

  /** Checks whether the given feature key is enabled for a plan. */
  private async isFeatureEnabledForPlan(planKey: string, featureKey: string): Promise<boolean> {
    const row = await this.planFeaturesModel.findOne({
      where: { plan: planKey, featureKey },
      attributes: ['enabled'],
    });

    // If no row exists, the feature is considered disabled for that plan.
    return row?.enabled === true;
  }
}
