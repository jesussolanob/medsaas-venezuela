import { Inject, Injectable } from '@nestjs/common';
import { AppointmentNotFoundError } from '../../../domain/errors/appointment-not-found.error';
import {
  APPOINTMENT_REPOSITORY,
  type IAppointmentRepository,
  type ChangeLogEntry,
} from '../../../domain/repositories/appointment.repository';
import {
  CONSULTATION_REPOSITORY,
  type IConsultationRepository,
} from '../../../../consultations/domain/repositories/consultation.repository';
import {
  PAYMENT_REPOSITORY,
  type IPaymentRepository,
} from '../../../../finances/domain/repositories/payment.repository';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../../patients/domain/repositories/patient.repository';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../../doctor-settings/domain/repositories/doctor-profile.repository';
import type { Appointment } from '../../../domain/entities/appointment.entity';
import type { Consultation } from '../../../../consultations/domain/entities/consultation.entity';
import type { Patient } from '../../../../patients/domain/entities/patient.entity';
import type { DoctorProfile } from '../../../../doctor-settings/domain/entities/doctor-profile.entity';
import type { Payment } from '../../../../finances/domain/entities/payment.entity';
import type { PaymentItem } from '../../../../finances/domain/entities/payment-item.entity';

export interface Appointment360Input {
  appointmentId: string;
  doctorId: string;
}

/**
 * Decrypted patient PII visible only to the owning doctor.
 * Uses a dedicated type — NEVER reuse the masked list mapper shape.
 * ADR-005: owner-scoped PII decryption, no audit log required (owner access).
 */
export interface PatientPiiView {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  cedula: string | null;
  birthDate: string | null;
  age: number | null;
  sex: string | null;
  bloodType: string | null;
  allergies: string | null;
  chronicConditions: string | null;
}

export interface DoctorView {
  id: string;
  fullName: string;
  specialty: string | null;
  professionalTitle: string | null;
  officeAddress: string | null;
  city: string | null;
  avatarUrl: string | null;
}

export interface Appointment360Result {
  appointment: Appointment;
  consultation: Consultation | null;
  payment: Payment | null;
  paymentItems: PaymentItem[];
  patient: PatientPiiView | null;
  doctor: DoctorView | null;
  rescheduleChain: Appointment[];
  changeLog: ChangeLogEntry[];
}

/**
 * GetAppointment360UseCase
 *
 * Assembles the full 360° view of an appointment for the cita-360 detail page.
 * Performs five parallel lookups after the initial ownership check:
 *   1. Consultation linked to this appointment (by appointment_id)
 *   2. Payment linked to this appointment (by appointment.paymentId)
 *   3. Patient PII decrypted — owner-scoped (ADR-005)
 *   4. Doctor profile (non-PII fields only)
 *   5. Reschedule chain (other appointments sharing the same consultation_id)
 *   6. Audit change log for this appointment
 *
 * SECURITY:
 *   - Double anti-IDOR: appointment must belong to doctorId, and patient lookup
 *     is scoped by doctorId in the repo (cannot read another doctor's patient).
 *   - Payment items fetched only when a payment exists and belongs to the doctor.
 *   - Doctor profile read is for the authenticated doctor's own profile.
 */
@Injectable()
export class GetAppointment360UseCase {
  constructor(
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: IAppointmentRepository,
    @Inject(CONSULTATION_REPOSITORY)
    private readonly consultationRepo: IConsultationRepository,
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepo: IPaymentRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly doctorProfileRepo: IDoctorProfileRepository,
  ) {}

  async execute(input: Appointment360Input): Promise<Appointment360Result> {
    // 1. Fetch appointment with ownership check (anti-IDOR)
    const appointment = await this.appointmentRepo.findByIdForDoctor(
      input.appointmentId,
      input.doctorId,
    );
    if (!appointment) {
      throw new AppointmentNotFoundError(input.appointmentId);
    }

    // Redundant guard — findByIdForDoctor already scopes by doctorId. Anti-enumeración:
    // tratar como inexistente (no revelar existencia de citas de otros doctores).
    if (!appointment.canBeModifiedBy(input.doctorId)) {
      throw new AppointmentNotFoundError(input.appointmentId);
    }

    // 2. Run all secondary lookups in parallel for performance
    const [consultation, payment, patient, doctorProfile, changeLog] = await Promise.all([
      this.consultationRepo.findByAppointmentId(input.appointmentId, input.doctorId),
      appointment.paymentId
        ? this.paymentRepo.findByIdForDoctor(appointment.paymentId, input.doctorId)
        : Promise.resolve(null),
      appointment.patientId
        ? this.patientRepo.findById(appointment.patientId, input.doctorId)
        : Promise.resolve(null),
      this.doctorProfileRepo.findByDoctorId(input.doctorId),
      this.appointmentRepo.findChangeLogs(input.appointmentId),
    ]);

    // 3. Payment items — only when there is a payment (sequential on payment result)
    let paymentItems: PaymentItem[] = [];
    if (payment) {
      paymentItems = await this.paymentRepo.listItems(payment.id, input.doctorId);
    }

    // 4. Reschedule chain — only when a consultation links multiple appointments
    const rescheduleChain: Appointment[] = consultation?.appointmentId
      ? await this.appointmentRepo.findRescheduleChain(
          consultation.id,
          input.appointmentId,
          input.doctorId,
        )
      : [];

    return {
      appointment,
      consultation: consultation ?? null,
      payment: payment ?? null,
      paymentItems,
      patient: patient ? this.toPatientPiiView(patient) : null,
      doctor: doctorProfile ? this.toDoctorView(doctorProfile) : null,
      rescheduleChain,
      changeLog,
    };
  }

  /**
   * Maps a Patient domain entity to the decrypted-PII view.
   * Dedicated mapper — NEVER reuse the masked list mapper (ADR-005).
   * Only the fields needed by the cita-360 view are included.
   */
  private toPatientPiiView(patient: Patient): PatientPiiView {
    return {
      id: patient.id,
      fullName: patient.fullName,
      phone: patient.phone,
      email: patient.email,
      cedula: patient.cedula,
      birthDate: patient.birthDate,
      age: patient.age,
      sex: patient.sex,
      bloodType: patient.bloodType,
      allergies: patient.allergies,
      chronicConditions: patient.chronicConditions,
    };
  }

  /** Maps a DoctorProfile to the public view (no payment_details, no PII beyond name). */
  private toDoctorView(profile: DoctorProfile): DoctorView {
    return {
      id: profile.id,
      fullName: profile.fullName,
      specialty: profile.specialty,
      professionalTitle: profile.professionalTitle,
      officeAddress: profile.officeAddress,
      city: profile.city,
      avatarUrl: profile.avatarUrl,
    };
  }
}
