/**
 * Value Object representing a per-period price entry for a plan.
 *
 * Immutable by construction.
 */
export type BillingPeriod = 'monthly' | 'quarterly' | 'semiannual' | 'annual';

export class PlanPrice {
  constructor(
    public readonly id: string,
    public readonly planKey: string,
    public readonly period: BillingPeriod,
    public readonly priceUsd: number,
    public readonly isActive: boolean,
  ) {}
}
