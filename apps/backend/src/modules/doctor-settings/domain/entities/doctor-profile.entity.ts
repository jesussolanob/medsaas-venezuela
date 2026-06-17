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
  logoUrl: string | null;
  signatureUrl: string | null;
  licenseNumber: string | null;
  phone: string | null;
  currencyMode: string | null;
  customRate: number | null;
  customRateLabel: string | null;
  /** National ID (cedula). Read-only after onboarding — never updated via profile PUT. */
  cedula: string | null;
  /** Doctor's date of birth in ISO format (YYYY-MM-DD). Editable by the doctor. */
  birthDate: string | null;
  /**
   * Explicit flag set by CompleteRegistrationUseCase when the doctor submits
   * the onboarding form. Replaces the fragile frontend heuristic that inferred
   * onboarding completion from specialty being non-null.
   */
  onboardingCompleted: boolean;
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
  logoUrl?: string | null;
  signatureUrl?: string | null;
  licenseNumber?: string | null;
  phone?: string | null;
  /** Doctor's date of birth (YYYY-MM-DD). Editable. cedula is intentionally excluded. */
  birthDate?: string | null;
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
  readonly logoUrl: string | null;
  readonly signatureUrl: string | null;
  readonly licenseNumber: string | null;
  readonly phone: string | null;
  readonly currencyMode: string | null;
  readonly customRate: number | null;
  readonly customRateLabel: string | null;
  /** National ID (cedula). Read-only after onboarding. */
  readonly cedula: string | null;
  /** Date of birth in YYYY-MM-DD format. Nullable and editable by the doctor. */
  readonly birthDate: string | null;
  /** True once the doctor has submitted the onboarding form. Set server-side — never derived from specialty. */
  readonly onboardingCompleted: boolean;

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
    this.logoUrl = params.logoUrl;
    this.signatureUrl = params.signatureUrl;
    this.licenseNumber = params.licenseNumber;
    this.phone = params.phone;
    this.currencyMode = params.currencyMode;
    this.customRate = params.customRate;
    this.customRateLabel = params.customRateLabel;
    this.cedula = params.cedula;
    this.birthDate = params.birthDate;
    this.onboardingCompleted = params.onboardingCompleted;
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
