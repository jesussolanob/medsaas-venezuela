import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  APPOINTMENT_REPOSITORY,
  type IAppointmentRepository,
} from '../../../../appointments/domain/repositories/appointment.repository';
import {
  CONSULTATION_REPOSITORY,
  type IConsultationRepository,
} from '../../../../consultations/domain/repositories/consultation.repository';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../../patients/domain/repositories/patient.repository';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../../doctor-settings/domain/repositories/doctor-profile.repository';
import { MailerService } from '../../../../email/application/services/mailer.service';
import { AppointmentNotFoundForReminderError } from '../../../domain/errors/appointment-not-found-for-reminder.error';
import { PatientEmailMissingError } from '../../../domain/errors/patient-email-missing.error';

export interface SendAppointmentReminderEmailInput {
  /** Authenticated doctor's user ID (from JWT / dev-auth token). */
  doctorId: string;
  /**
   * UUID of the appointment whose patient should receive the reminder.
   * Takes precedence over consultation_id when both are supplied.
   */
  appointmentId?: string;
  /**
   * UUID of the consultation linked to the appointment.
   * Resolved to an appointment when appointment_id is not supplied.
   */
  consultationId?: string;
}

export interface SendAppointmentReminderEmailOutput {
  sent: true;
}

/**
 * SendAppointmentReminderEmailUseCase
 *
 * Sends a branded reminder email (template 'reminder_manual') to the patient
 * of a given appointment, triggered manually by the authenticated doctor.
 *
 * FLOW:
 *   1. Resolve the appointment (anti-IDOR, scoped to doctorId).
 *   2. Resolve patient email (appointment.patientEmail → patient record fallback).
 *   3. Fetch doctor's display name from the profiles table.
 *   4. Render and dispatch via MailerService (template 'reminder_manual').
 *
 * SECURITY:
 *   - The appointment is always fetched via findByIdForDoctor(id, doctorId):
 *     a foreign appointment ID returns the same 404 as a missing one.
 *   - NEVER log PII (patient email, name, appointment code). The Logger only
 *     records non-sensitive context: appointmentId and boolean outcomes.
 *   - Email delivery errors are re-thrown as-is so the caller can map them.
 */
@Injectable()
export class SendAppointmentReminderEmailUseCase {
  private readonly logger = new Logger(SendAppointmentReminderEmailUseCase.name);

  constructor(
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: IAppointmentRepository,
    @Inject(CONSULTATION_REPOSITORY)
    private readonly consultationRepo: IConsultationRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly doctorProfileRepo: IDoctorProfileRepository,
    private readonly mailer: MailerService,
  ) {}

  async execute(
    input: SendAppointmentReminderEmailInput,
  ): Promise<SendAppointmentReminderEmailOutput> {
    // ------------------------------------------------------------------
    // 1. Resolve the appointment (anti-IDOR)
    // ------------------------------------------------------------------
    const resolvedAppointmentId = await this.resolveAppointmentId(input);

    const appointment = await this.appointmentRepo.findByIdForDoctor(
      resolvedAppointmentId,
      input.doctorId,
    );

    if (!appointment) {
      throw new AppointmentNotFoundForReminderError(resolvedAppointmentId);
    }

    // ------------------------------------------------------------------
    // 2. Resolve patient email
    // ------------------------------------------------------------------
    let patientEmail: string | null = appointment.patientEmail;

    if (!patientEmail && appointment.patientId) {
      // Fallback: fetch the patient record (decrypted by SequelizePatientRepository).
      // Scoped to doctorId → same anti-IDOR guarantee.
      const patient = await this.patientRepo.findById(appointment.patientId, input.doctorId);
      patientEmail = patient?.email ?? null;
    }

    if (!patientEmail) {
      throw new PatientEmailMissingError();
    }

    // ------------------------------------------------------------------
    // 3. Resolve doctor display name
    // ------------------------------------------------------------------
    const doctorProfile = await this.doctorProfileRepo.findByDoctorId(input.doctorId);
    const doctorName = doctorProfile?.fullName ?? 'Su especialista';

    // ------------------------------------------------------------------
    // 4. Format date and time in Caracas timezone (America/Caracas UTC-4)
    // ------------------------------------------------------------------
    const scheduledAt = appointment.scheduledAt;
    const date = scheduledAt.toLocaleDateString('es-VE', {
      timeZone: 'America/Caracas',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const time = scheduledAt.toLocaleTimeString('es-VE', {
      timeZone: 'America/Caracas',
      hour: '2-digit',
      minute: '2-digit',
    });

    const service = appointment.planName ?? 'Consulta';
    const code = appointment.appointmentCode ?? appointment.id.slice(0, 8).toUpperCase();
    const patientName = appointment.patientName ?? 'Paciente';

    // ------------------------------------------------------------------
    // 5. Send via MailerService (template 'reminder_manual')
    // ------------------------------------------------------------------
    this.logger.debug(
      `[send-reminder] dispatching reminder for appointment=${resolvedAppointmentId}`,
    );

    await this.mailer.sendTemplate(
      'reminder_manual',
      patientEmail,
      {
        patient_name: patientName,
        doctor_name: doctorName,
        date,
        time,
        service,
        code,
      },
      { type: 'patient', id: appointment.patientId },
    );

    this.logger.debug(
      `[send-reminder] reminder sent successfully for appointment=${resolvedAppointmentId}`,
    );

    return { sent: true };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Resolves which appointment ID to use.
   * If appointment_id is provided, use it directly.
   * If only consultation_id is provided, look up the consultation (scoped to
   * doctorId) and extract its linked appointmentId.
   */
  private async resolveAppointmentId(input: SendAppointmentReminderEmailInput): Promise<string> {
    if (input.appointmentId) {
      return input.appointmentId;
    }

    if (!input.consultationId) {
      // Guarded by Zod schema (.refine) — should never reach here at runtime.
      throw new AppointmentNotFoundForReminderError('(no id provided)');
    }

    const consultation = await this.consultationRepo.findById(input.consultationId, input.doctorId);

    if (!consultation || !consultation.appointmentId) {
      throw new AppointmentNotFoundForReminderError(input.consultationId);
    }

    return consultation.appointmentId;
  }
}
