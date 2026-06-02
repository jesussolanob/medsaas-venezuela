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
}

export interface IBookingDoctorLoader {
  findById(doctorId: string): Promise<DoctorPublicInfo | null>;
}
