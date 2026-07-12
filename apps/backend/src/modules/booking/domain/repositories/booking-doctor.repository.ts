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
}

export interface IBookingDoctorLoader {
  findById(doctorId: string): Promise<DoctorPublicInfo | null>;
}
