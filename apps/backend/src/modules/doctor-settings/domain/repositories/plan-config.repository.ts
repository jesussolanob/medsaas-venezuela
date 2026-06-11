export const PLAN_CONFIG_REPOSITORY = Symbol('IPlanConfigRepository');

/** Minimal plan config projection needed by the doctor-settings module. */
export interface PlanConfigSummary {
  planKey: string;
  roleKey: string;
  isPermanent: boolean;
  isActive: boolean;
}

export interface IPlanConfigRepository {
  /** Find a plan configuration by its key. Returns null when not found. */
  findByKey(planKey: string): Promise<PlanConfigSummary | null>;

  /**
   * Find the first active permanent plan for a given role key.
   * Used for lazy-downgrade: when a subscription expires the doctor
   * falls back to this plan.
   */
  findPermanentPlanForRole(roleKey: string): Promise<PlanConfigSummary | null>;
}
