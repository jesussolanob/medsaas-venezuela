export const BOOKING_DOCTOR_LOADER = Symbol('IBookingDoctorLoader');

export interface DoctorPublicInfo {
  id: string;
  fullName: string;
  specialty: string | null;
  professionalTitle: string | null;
  paymentMethods: string[] | null;
  /**
   * Doctor's payment detail instructions (account numbers, mobile-pay details, etc.).
   * This is payment metadata set by the doctor — NOT patient PHI.
   * Shown on the public booking widget so patients know how to pay.
   */
  paymentDetails: Record<string, unknown> | null;
  allowsOnline: boolean | null;
  officeAddress: string | null;
  city: string | null;
  avatarUrl: string | null;
  isActive: boolean | null;
  /**
   * How many weeks ahead the booking widget can show available slots.
   * Sourced from doctor_schedules.booking_horizon_weeks (default 8).
   */
  bookingHorizonWeeks?: number;
  /**
   * Currency mode chosen by the doctor in Settings → Payment methods.
   * Controls which exchange rate is used to display prices in bolívares.
   *
   * Default: 'usd_bcv' when profiles.currency_mode is null (most profiles).
   * Exposed to the public booking widget so the patient sees the same
   * currency symbol and bolívar amount as the doctor.
   */
  currencyMode?: 'usd_bcv' | 'eur_bcv' | 'custom';
  /**
   * Doctor's personal exchange rate (bolívares per unit).
   * Only populated when currencyMode === 'custom'; null otherwise.
   * Not sensitive — the patient already sees the result of this calculation.
   */
  customRate?: number | null;
}

export interface IBookingDoctorLoader {
  findById(doctorId: string): Promise<DoctorPublicInfo | null>;
}
