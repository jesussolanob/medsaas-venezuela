/**
 * PricingPlan domain entity.
 *
 * Represents a doctor's service/plan offering shown to patients during booking.
 * Distinct from plan_configs (SaaS subscription plans).
 */
export type PricingPlanType = 'plan' | 'service';

export interface PricingPlanCreateParams {
  id: string;
  doctorId: string;
  name: string;
  priceUsd: number;
  durationMinutes: number;
  sessionsCount: number;
  description: string | null;
  type: PricingPlanType;
  showInBooking: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class PricingPlan {
  readonly id: string;
  readonly doctorId: string;
  readonly name: string;
  readonly priceUsd: number;
  readonly durationMinutes: number;
  readonly sessionsCount: number;
  readonly description: string | null;
  readonly type: PricingPlanType;
  readonly showInBooking: boolean;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(params: PricingPlanCreateParams) {
    this.id = params.id;
    this.doctorId = params.doctorId;
    this.name = params.name;
    this.priceUsd = params.priceUsd;
    this.durationMinutes = params.durationMinutes;
    this.sessionsCount = params.sessionsCount;
    this.description = params.description;
    this.type = params.type;
    this.showInBooking = params.showInBooking;
    this.isActive = params.isActive;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
  }

  /** Returns true when this plan can be shown in the public booking widget. */
  isPubliclyVisible(): boolean {
    return this.isActive && this.showInBooking;
  }

  /** Factory — creates a PricingPlan from raw data without persisting. */
  static create(params: PricingPlanCreateParams): PricingPlan {
    return new PricingPlan(params);
  }
}
