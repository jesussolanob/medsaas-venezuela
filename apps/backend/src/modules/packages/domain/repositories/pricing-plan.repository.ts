import type { PricingPlan } from '../entities/pricing-plan.entity';

export const PRICING_PLAN_REPOSITORY = Symbol('IPricingPlanRepository');

export interface PricingPlanUpdateParams {
  name?: string;
  priceUsd?: number;
  durationMinutes?: number;
  sessionsCount?: number;
  /** Days after purchase that deferred sessions must be scheduled. null = no expiry. */
  validityDays?: number | null;
  description?: string | null;
  type?: 'plan' | 'service';
  showInBooking?: boolean;
  isActive?: boolean;
  officeId?: string | null;
}

/**
 * Options for findAllByDoctorId — allows filtering by office.
 *
 * officeId present:
 *   Return plans explicitly assigned to that office OR general plans (officeId=null).
 *   This gives the doctor the full set of plans usable at that office.
 * officeId absent / undefined:
 *   Return all plans for the doctor (existing behaviour — backward compatible).
 */
export interface FindPlansByDoctorOptions {
  /** When provided, filter to plans for this office + general plans. */
  officeId?: string;
}

export interface IPricingPlanRepository {
  /** Find all active plans visible in the public booking widget for a doctor. */
  findPublicByDoctorId(doctorId: string): Promise<PricingPlan[]>;

  /**
   * Find plans for a doctor (including hidden ones — for the doctor dashboard).
   *
   * When options.officeId is supplied, returns plans explicitly tied to that
   * office PLUS plans with officeId=null (general plans).
   * Without options.officeId, returns all plans (default / backward compat).
   */
  findAllByDoctorId(doctorId: string, options?: FindPlansByDoctorOptions): Promise<PricingPlan[]>;

  /** Find a single plan by ID. Returns null if not found. */
  findById(id: string): Promise<PricingPlan | null>;

  /** Persist a new pricing plan. Returns the saved domain entity. */
  save(plan: PricingPlan): Promise<PricingPlan>;

  /** Update fields on an existing pricing plan. Returns the updated entity. */
  update(id: string, params: PricingPlanUpdateParams): Promise<PricingPlan>;

  /** Soft-delete (isActive = false) or hard-delete a pricing plan. */
  delete(id: string): Promise<void>;
}
