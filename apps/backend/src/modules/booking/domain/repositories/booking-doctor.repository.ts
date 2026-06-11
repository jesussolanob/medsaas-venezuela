export const BOOKING_DOCTOR_LOADER = Symbol('IBookingDoctorLoader');

export interface DoctorPublicInfo {
  id: string;
  fullName: string;
  specialty: string | null;
  professionalTitle: string | null;
  paymentMethods: string[] | null;
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
