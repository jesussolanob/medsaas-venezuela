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
  ) {}

  /** Returns true when the plan is currently available for new subscriptions. */
  isAvailable(): boolean {
    return this.isActive;
  }
}
