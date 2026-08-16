import { Inject, Injectable } from '@nestjs/common';
import type { CreateImmediateAppointmentDto } from '@delta/shared-types';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../../patients/domain/repositories/patient.repository';
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
}

/**
 * CreateImmediateAppointmentUseCase
 *
 * Creates a walk-in (immediate) appointment whose scheduled_at is the current
 * server time. The client-provided scheduled_at is always ignored.
 *
 * Flow:
 *   1. Anti-IDOR: load patient by patient_id scoped to doctorId.
 *   2. Compute immediate window via GetImmediateWindowUseCase.
 *   3. Resolve effective duration (force vs. normal mode).
 *   4. Delegate to CreateBookingUseCase with skipDoctorOverlapCheck=force.
 *
 * Security invariants:
 *   - doctorId ALWAYS comes from the authenticated CurrentUser.sub — never from body.
 *   - patient_id must belong to the authenticated doctor (anti-IDOR).
 *   - Patient cross-doctor overlap check is NEVER bypassed, even with force=true.
 *   - NEVER log PII (patient name, cedula, email, phone).
 */
@Injectable()
export class CreateImmediateAppointmentUseCase {
  constructor(
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
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

        // Appointment details from the DTO.
        appointment_mode: dto.appointment_mode,
        plan_name: dto.plan_name,
        plan_price: dto.plan_price,
        duration_minutes: effectiveDuration,

        // Payment fields.
        payment_method: dto.payment_method ?? undefined,
        payment_reference: dto.payment_reference ?? undefined,
        bcv_rate: dto.bcv_rate ?? undefined,
        package_id: dto.package_id ?? undefined,
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

    return {
      appointmentId: result.appointment.id,
      appointmentCode: result.appointmentCode,
      scheduledAt: result.appointment.scheduledAt,
      effectiveDuration,
      meetLink: result.meetLink,
    };
  }
}
