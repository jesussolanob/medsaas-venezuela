/**
 * DoctorProfile domain entity.
 *
 * Represents the authenticated doctor's own profile data.
 * Includes payment_details (sensitive — never expose in public/list responses).
 * No external dependencies — pure domain logic only.
 */
export interface DoctorProfileCreateParams {
  id: string;
  fullName: string;
  email: string;
  specialty: string | null;
  professionalTitle: string | null;
  clinicId: string | null;
  clinicRole: string | null;
  paymentMethods: string[];
  paymentDetails: Record<string, unknown>;
  allowsOnline: boolean;
  officeAddress: string | null;
  city: string | null;
  avatarUrl: string | null;
  plan: string | null;
  subscriptionStatus: string | null;
}

export interface DoctorProfileUpdateParams {
  specialty?: string | null;
  professionalTitle?: string | null;
  paymentMethods?: string[];
  paymentDetails?: Record<string, unknown>;
  allowsOnline?: boolean;
  officeAddress?: string | null;
  city?: string | null;
  avatarUrl?: string | null;
}

export class DoctorProfile {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  readonly specialty: string | null;
  readonly professionalTitle: string | null;
  readonly clinicId: string | null;
  readonly clinicRole: string | null;
  readonly paymentMethods: string[];
  readonly paymentDetails: Record<string, unknown>;
  readonly allowsOnline: boolean;
  readonly officeAddress: string | null;
  readonly city: string | null;
  readonly avatarUrl: string | null;
  readonly plan: string | null;
  readonly subscriptionStatus: string | null;

  constructor(params: DoctorProfileCreateParams) {
    this.id = params.id;
    this.fullName = params.fullName;
    this.email = params.email;
    this.specialty = params.specialty;
    this.professionalTitle = params.professionalTitle;
    this.clinicId = params.clinicId;
    this.clinicRole = params.clinicRole;
    this.paymentMethods = params.paymentMethods;
    this.paymentDetails = params.paymentDetails;
    this.allowsOnline = params.allowsOnline;
    this.officeAddress = params.officeAddress;
    this.city = params.city;
    this.avatarUrl = params.avatarUrl;
    this.plan = params.plan;
    this.subscriptionStatus = params.subscriptionStatus;
  }

  /** Public booking link for sharing with patients. */
  get bookingLink(): string {
    return `/book/${this.id}`;
  }

  /** Returns true if the doctor accepts online appointments. */
  isOnlineEnabled(): boolean {
    return this.allowsOnline;
  }

  static create(params: DoctorProfileCreateParams): DoctorProfile {
    return new DoctorProfile(params);
  }
}
