/**
 * PricingPlan domain entity.
 *
 * Represents a doctor's service/plan offering shown to patients during booking.
 * Distinct from plan_configs (SaaS subscription plans).
 *
 * officeId — optional association to a specific doctor_office.
 *   null = "general" plan applicable to all offices (backward compatible).
 */
export type PricingPlanType = 'plan' | 'service';

export interface PricingPlanCreateParams {
  id: string;
  doctorId: string;
  /** FK → doctor_offices(id). Optional. null = general plan (all offices). */
  officeId?: string | null;
  name: string;
  priceUsd: number;
  durationMinutes: number;
  sessionsCount: number;
  /**
   * How many days after purchase the patient has to schedule deferred sessions.
   * null = no expiry (pending_consultations never expire).
   */
  validityDays?: number | null;
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
  /** FK → doctor_offices(id). Null = general plan (all offices). */
  readonly officeId: string | null;
  readonly name: string;
  readonly priceUsd: number;
  readonly durationMinutes: number;
  readonly sessionsCount: number;
  /**
   * How many days after purchase the patient has to schedule deferred sessions.
   * null = no expiry.
   */
  readonly validityDays: number | null;
  readonly description: string | null;
  readonly type: PricingPlanType;
  readonly showInBooking: boolean;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(params: PricingPlanCreateParams) {
    this.id = params.id;
    this.doctorId = params.doctorId;
    this.officeId = params.officeId ?? null;
    this.name = params.name;
    this.priceUsd = params.priceUsd;
    this.durationMinutes = params.durationMinutes;
    this.sessionsCount = params.sessionsCount;
    this.validityDays = params.validityDays ?? null;
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

  /**
   * Returns true when this plan is applicable for the given office.
   *
   * A plan is applicable when:
   *   - it is a general plan (officeId === null), OR
   *   - it is explicitly assigned to the requested office.
   */
  isApplicableForOffice(officeId: string): boolean {
    return this.officeId === null || this.officeId === officeId;
  }

  /** Factory — creates a PricingPlan from raw data without persisting. */
  static create(params: PricingPlanCreateParams): PricingPlan {
    return new PricingPlan(params);
  }
}
