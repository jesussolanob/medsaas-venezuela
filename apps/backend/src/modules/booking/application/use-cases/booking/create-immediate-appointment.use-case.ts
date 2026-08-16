import { Inject, Injectable } from '@nestjs/common';
import type { CreateImmediateAppointmentDto } from '@delta/shared-types';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../../patients/domain/repositories/patient.repository';
import {
  PENDING_CONSULTATION_REPOSITORY,
  type IPendingConsultationRepository,
} from '../../../../pending-consultations/domain/repositories/pending-consultation.repository';
import { PendingConsultationNotFoundError } from '../../../../pending-consultations/domain/errors/pending-consultation-not-found.error';
import { PendingConsultationNotSchedulableError } from '../../../../pending-consultations/domain/errors/pending-consultation-not-schedulable.error';
import { PendingConsultationExpiredError } from '../../../../pending-consultations/domain/errors/pending-consultation-expired.error';
import type { PendingConsultation } from '../../../../pending-consultations/domain/entities/pending-consultation.entity';
import { PatientNotFoundError } from './create-booking.use-case';
import { CreateBookingUseCase } from './create-booking.use-case';
import {
  GetImmediateWindowUseCase,
  type ImmediateWindowResult,
} from './get-immediate-window.use-case';
import { NoImmediateSlotError } from '../../../domain/errors/no-immediate-slot.error';

/**
 * Minimum number of minutes required to accept an immediate-consultation request
 * without force=true.  Below this threshold, NoImmediateSlotError (HTTP 409) is
 * thrown so the doctor knows there is not enough meaningful time left.
 *
 * Matches the minimum value of duration_minutes in CreateImmediateAppointmentDtoSchema (5).
 */
const MIN_IMMEDIATE_MINUTES = 5;

export interface CreateImmediateAppointmentResult {
  appointmentId: string;
  appointmentCode: string;
  scheduledAt: Date;
  effectiveDuration: number;
  meetLink: string | null;
  /** Consulta recién creada — el modal la abre para atender al paciente. */
  consultationId: string | null;
}

/**
 * CreateImmediateAppointmentUseCase
 *
 * Creates a walk-in (immediate) appointment whose scheduled_at is the current
 * server time. The client-provided scheduled_at is always ignored.
 *
 * Flow (without pending_consultation_id):
 *   1. Anti-IDOR: load patient by patient_id scoped to doctorId.
 *   2. Compute immediate window via GetImmediateWindowUseCase.
 *   3. Resolve effective duration (force vs. normal mode).
 *   4. Delegate to CreateBookingUseCase.
 *
 * Flow (with pending_consultation_id — pre-paid session path):
 *   1. Anti-IDOR: load patient + pending consultation, verify both belong to
 *      the authenticated doctor and that the pending belongs to the patient.
 *   2. Verify pending consultation is schedulable (not expired, pending_scheduling).
 *   3. Override plan_name / plan_price from the pending row (client values ignored).
 *   4. Compute window + effective duration (same rules as without pending).
 *   5. Delegate to CreateBookingUseCase to create the appointment.
 *   6. Mark the pending consultation as 'scheduled' ONLY AFTER the appointment
 *      is confirmed — if CreateBookingUseCase throws, the pending stays untouched.
 *
 * Security invariants:
 *   - doctorId ALWAYS comes from the authenticated CurrentUser.sub — never from body.
 *   - patient_id must belong to the authenticated doctor (anti-IDOR).
 *   - pending_consultation_id must belong to both the doctor AND the patient (double IDOR).
 *   - Patient cross-doctor overlap check is NEVER bypassed, even with force=true.
 *   - NEVER log PII (patient name, cedula, email, phone).
 */
@Injectable()
export class CreateImmediateAppointmentUseCase {
  constructor(
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
    @Inject(PENDING_CONSULTATION_REPOSITORY)
    private readonly pendingRepo: IPendingConsultationRepository,
    private readonly getWindow: GetImmediateWindowUseCase,
    private readonly createBooking: CreateBookingUseCase,
  ) {}

  async execute(
    doctorId: string,
    dto: CreateImmediateAppointmentDto,
  ): Promise<CreateImmediateAppointmentResult> {
    // --- Step 1: Anti-IDOR patient load ---
    // findById(id, doctorId) returns null both when the patient does not exist
    // AND when it belongs to another doctor — identical error prevents enumeration.
    const patient = await this.patientRepo.findById(dto.patient_id, doctorId);
    if (!patient) {
      throw new PatientNotFoundError(dto.patient_id);
    }

    // --- Step 1b (optional): Validate pending consultation ---
    // When pending_consultation_id is present, the walk-in consumes a pre-paid session.
    let pendingConsultation: PendingConsultation | null = null;
    let planName = dto.plan_name;
    let planPrice = dto.plan_price;

    if (dto.pending_consultation_id) {
      // Anti-IDOR doctor check: findByIdAndDoctor returns null for wrong doctor.
      pendingConsultation = await this.pendingRepo.findByIdAndDoctor(
        dto.pending_consultation_id,
        doctorId,
      );
      if (!pendingConsultation) {
        throw new PendingConsultationNotFoundError(dto.pending_consultation_id);
      }

      // Anti-IDOR patient check: the pending consultation must belong to the same
      // patient being attended. Same error as "not found" to prevent enumeration
      // of pending consultations across patients.
      if (pendingConsultation.patientId !== dto.patient_id) {
        throw new PendingConsultationNotFoundError(dto.pending_consultation_id);
      }

      // Distinguish expired (time-based) from other non-schedulable states
      // (already scheduled, cancelled) — distinct errors for clear UI feedback.
      if (pendingConsultation.expiresAt !== null && pendingConsultation.expiresAt <= new Date()) {
        throw new PendingConsultationExpiredError(dto.pending_consultation_id);
      }
      if (!pendingConsultation.isSchedulable()) {
        throw new PendingConsultationNotSchedulableError(dto.pending_consultation_id);
      }

      // Plan name and price come from the pending row — the session is already paid.
      // Any plan_name / plan_price sent by the client is silently ignored.
      planName = pendingConsultation.planName;
      planPrice = 0; // pre-paid; no new charge
    }

    // --- Step 2: Compute available window ---
    const window: ImmediateWindowResult = await this.getWindow.execute({
      doctorId,
      durationMinutes: dto.duration_minutes,
    });

    // --- Step 3: Resolve effective duration ---
    let effectiveDuration: number;
    if (dto.force) {
      // force=true: use the full service duration regardless of the next appointment.
      // The doctor explicitly accepts the overlap.
      effectiveDuration = dto.duration_minutes;
    } else {
      // Normal mode: clamp to the time available before the next appointment.
      effectiveDuration = window.effectiveDuration;

      // If there is not enough room for a meaningful consultation, reject.
      if (effectiveDuration < MIN_IMMEDIATE_MINUTES) {
        throw new NoImmediateSlotError(window.availableMinutes);
      }
    }

    // --- Step 4: Delegate to CreateBookingUseCase ---
    // The scheduled_at is always the current server time — the client value is ignored.
    const now = window.now;

    const result = await this.createBooking.execute(
      {
        // Anti-IDOR: doctorId is from authenticated session, NOT from the request body.
        doctor_id: doctorId,

        // Patient identity from the loaded domain entity (plaintext PII — already
        // decrypted by the repository layer, stored in memory only for this request).
        patient_id: patient.id,
        patient_name: patient.fullName,
        // patient_cedula is string|null on the entity; CreateBookingDto types it as
        // string (required for the public form). The use-case layer stores this via
        // `dto.patient_cedula ?? null`, so null passes through safely at runtime.
        // The double-cast avoids the TS error without touching the shared schema.
        patient_cedula: (patient.cedula ?? null) as unknown as string,
        patient_email: patient.email,
        patient_phone: patient.phone ?? undefined,

        // The server sets scheduled_at — client value is discarded.
        scheduled_at: now.toISOString(),

        // Appointment details. When a pending consultation is present, plan_name
        // and plan_price are overridden above to come from the pending row.
        appointment_mode: dto.appointment_mode,
        plan_name: planName,
        plan_price: planPrice,
        duration_minutes: effectiveDuration,

        // Payment fields. When consuming a pending session, package_id links the
        // appointment back to the original package for reporting.
        payment_method: pendingConsultation ? 'package' : (dto.payment_method ?? undefined),
        payment_reference: dto.payment_reference ?? undefined,
        bcv_rate: dto.bcv_rate ?? undefined,
        package_id: pendingConsultation
          ? (pendingConsultation.packageId ?? undefined)
          : (dto.package_id ?? undefined),
        plan_id: dto.plan_id ?? undefined,

        // Office linkage.
        office_id: dto.office_id,

        // Optional chief complaint.
        chief_complaint: dto.chief_complaint ?? undefined,

        // Turnstile stub: authenticated endpoint — no token needed.
        // The stub in CreateBookingUseCase is a no-op for Etapa 1.
        cf_turnstile_token: '__immediate_internal__',
      },
      {
        skipBookingFeatureGate: true,
        skipPatientBookingRules: true,
        // force=true → skip the doctor overlap check (patient overlap is NEVER skipped).
        skipDoctorOverlapCheck: dto.force,
      },
    );

    // --- Step 5 (pending path only): Mark pending consultation as scheduled ---
    //
    // CRITICAL ordering: this update happens ONLY AFTER the appointment is confirmed.
    // If CreateBookingUseCase.execute() threw above, we never reach this line, so
    // the pending consultation stays in 'pending_scheduling' — the session is safe.
    //
    // If this update fails after the appointment is created, the appointment still
    // exists and is valid. The pending row can be re-linked manually. This is the
    // correct trade-off: an orphaned appointment is recoverable; a lost pre-paid
    // session is not.
    if (pendingConsultation) {
      // El id de la consulta sale de `result.consultationId`, NO de la entidad:
      // el FK se actualiza en la BD después de construirla, así que
      // `appointment.consultationId` todavía viene en null. Leerlo de ahí dejaba
      // la sesión del combo sin enlazar a su consulta.
      const scheduled = pendingConsultation.markScheduled(
        result.appointment.id,
        result.consultationId,
      );
      await this.pendingRepo.save(scheduled);
    }

    return {
      appointmentId: result.appointment.id,
      appointmentCode: result.appointmentCode,
      scheduledAt: result.appointment.scheduledAt,
      effectiveDuration,
      meetLink: result.meetLink,
      consultationId: result.consultationId,
    };
  }
}
