export const PLAN_FEATURES_REPOSITORY = Symbol('IPlanFeaturesRepository');

export interface PlanFeature {
  featureKey: string;
  featureLabel: string;
  enabled: boolean;
}

export interface IPlanFeaturesRepository {
  /** Find all features configured for a given plan key. Returns empty array when none found. */
  findByPlan(plan: string): Promise<PlanFeature[]>;
}
