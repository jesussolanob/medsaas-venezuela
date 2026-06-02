import type { PricingPlan } from '../entities/pricing-plan.entity';

export const PRICING_PLAN_REPOSITORY = Symbol('IPricingPlanRepository');

export interface PricingPlanUpdateParams {
  name?: string;
  priceUsd?: number;
  durationMinutes?: number;
  sessionsCount?: number;
  description?: string | null;
  type?: 'plan' | 'service';
  showInBooking?: boolean;
  isActive?: boolean;
}

export interface IPricingPlanRepository {
  /** Find all active plans visible in the public booking widget for a doctor. */
  findPublicByDoctorId(doctorId: string): Promise<PricingPlan[]>;

  /** Find all plans for a doctor (including hidden ones — for the doctor dashboard). */
  findAllByDoctorId(doctorId: string): Promise<PricingPlan[]>;

  /** Find a single plan by ID. Returns null if not found. */
  findById(id: string): Promise<PricingPlan | null>;

  /** Persist a new pricing plan. Returns the saved domain entity. */
  save(plan: PricingPlan): Promise<PricingPlan>;

  /** Update fields on an existing pricing plan. Returns the updated entity. */
  update(id: string, params: PricingPlanUpdateParams): Promise<PricingPlan>;

  /** Soft-delete (isActive = false) or hard-delete a pricing plan. */
  delete(id: string): Promise<void>;
}
