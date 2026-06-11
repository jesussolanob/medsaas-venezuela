/**
 * Value Object representing a SaaS plan configuration.
 *
 * Encapsulates plan data from the plan_configs table.
 * Immutable by construction — all properties are readonly.
 */
export class PlanConfig {
  constructor(
    public readonly planKey: string,
    public readonly name: string,
    public readonly priceUsd: number,
    public readonly trialDays: number,
    public readonly isActive: boolean,
    public readonly description: string | null,
    public readonly sortOrder: number,
    /** Role this plan is associated with (e.g. 'doctor'). Default: 'doctor'. */
    public readonly roleKey: string = 'doctor',
    /**
     * When true the plan never expires — a subscription on this plan is always
     * considered active regardless of current_period_end.
     */
    public readonly isPermanent: boolean = false,
  ) {}

  /** Returns true when the plan is currently available for new subscriptions. */
  isAvailable(): boolean {
    return this.isActive;
  }
}
