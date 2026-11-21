import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  APPOINTMENT_REPOSITORY,
  type IAppointmentRepository,
} from '../../../domain/repositories/appointment.repository';
import { AppointmentRescheduleTokenService } from '../../../infrastructure/services/appointment-reschedule-token.service';
import { AppointmentRescheduleInvalidTokenError } from '../../../domain/errors/appointment-reschedule-invalid-token.error';
import { AppointmentConflictError } from '../../../domain/errors/appointment-conflict.error';
import { AppointmentSlotUnavailableError } from '../../../domain/errors/appointment-slot-unavailable.error';
import { AppointmentNotReschedulableError } from '../../../domain/errors/appointment-not-reschedulable.error';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../../doctor-settings/domain/repositories/doctor-profile.repository';
import { GetAvailableSlotsUseCase } from '../../../../booking/application/use-cases/booking/get-available-slots.use-case';
import { toCaracasHHMM } from '../../../../../domain/caracas-time';

/** Statuses that allow a public reschedule via token link. */
const TOKEN_RESCHEDULABLE_STATUSES: ReadonlySet<string> = new Set(['scheduled', 'confirmed']);

/** Default slot duration used for overlap detection when the appointment has no stored duration. */
const DEFAULT_SLOT_DURATION_MINUTES = 30;

export interface AppointmentRescheduleInfo {
  /** Patient first name only — no full name, no PII beyond this. */
  patientFirstName: string;
  /** Doctor display name (title + name). */
  doctorName: string;
  /** Human-readable date in Spanish (America/Caracas). */
  date: string;
  /** HH:MM time string in America/Caracas. */
  time: string;
  /** Appointment mode. */
  modality: string;
  /** Office name, if set. */
  officeName: string | null;
  /** Current scheduledAt as ISO string — used by the frontend to populate the reschedule form. */
  currentScheduledAt: string;
  /** Appointment status. */
  status: string;
}

/**
 * RescheduleByTokenUseCase
 *
 * Implements the two-phase public reschedule flow triggered from a WhatsApp
 * quick-reply button.
 *
 * Phase A — GET info:
 *   Verifies the token, checks the satMs matches the current scheduledAt (not
 *   already rescheduled), and returns safe non-PII appointment info for the
 *   reschedule form.
 *
 * Phase B — POST new datetime:
 *   Same token verification, then validates slot availability and moves the
 *   appointment to the new scheduledAt. The old token is now stale (satMs
 *   mismatch) — single-use guarantee.
 *
 * Security:
 *   - Token verified before any DB access.
 *   - Invalid/stale tokens → 404 (anti-enumeration).
 *   - Response contains only safe non-PII fields (first name, doctor, date/time).
 *   - Cancelled/completed appointments are not reschedulable via token.
 */
@Injectable()
export class RescheduleByTokenUseCase {
  private readonly logger = new Logger(RescheduleByTokenUseCase.name);

  constructor(
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: IAppointmentRepository,
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly doctorProfileRepo: IDoctorProfileRepository,
    private readonly tokenService: AppointmentRescheduleTokenService,
    /**
     * GetAvailableSlotsUseCase — required. Validates that the requested new
     * scheduledAt is an actual slot offered by the doctor's office schedule,
     * including availability blocks, booking horizon, and min lead days.
     *
     * Provided in AppointmentsModule (not imported from BookingModule to avoid
     * the AppointmentsModule → BookingModule → PendingConsultationsModule →
     * AppointmentsModule circular dependency).
     */
    private readonly slotsUseCase: GetAvailableSlotsUseCase,
    /**
     * SyncConsultationDateUseCase — optional. When present, moves the
     * consultation date alongside the appointment date.
     * Injected by string token because TypeScript emits Object for union types.
     */
    @Optional()
    @Inject('SYNC_CONSULTATION_DATE_USE_CASE')
    private readonly syncConsultationDate: {
      execute(input: {
        appointmentId: string;
        doctorId: string;
        newScheduledAt: Date;
      }): Promise<void>;
    } | null = null,
  ) {}

  /**
   * Phase A: returns appointment info for the reschedule form.
   * Verifies token and checks the appointment is still reschedulable.
   *
   * @throws AppointmentRescheduleInvalidTokenError on bad / stale token or non-reschedulable appointment.
   */
  async getInfo(token: string): Promise<AppointmentRescheduleInfo> {
    const { appointment, doctorName } = await this.loadAndVerify(token);
    return this.buildInfo(appointment, doctorName);
  }

  /**
   * Phase B: validates the new datetime and moves the appointment.
   *
   * @throws AppointmentRescheduleInvalidTokenError on bad / stale token.
   * @throws AppointmentNotReschedulableError when status is not reschedulable.
   * @throws AppointmentConflictError when the new slot is taken.
   */
  async execute(token: string, newScheduledAt: Date): Promise<AppointmentRescheduleInfo> {
    const { appointment, doctorName } = await this.loadAndVerify(token);

    // Reject past dates immediately — rescheduling to a time in the past is
    // never valid regardless of slot availability.
    if (newScheduledAt <= new Date()) {
      throw new AppointmentConflictError(newScheduledAt);
    }

    const durationMinutes = appointment.durationMinutes ?? DEFAULT_SLOT_DURATION_MINUTES;

    // Validate that the requested time is an actual slot in the doctor's public
    // booking availability: same constraints as the booking widget (office schedule
    // blocks with per-block slotDuration and buffers, availability blocks/vacations,
    // booking horizon, and min lead days).
    const dateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Caracas',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(newScheduledAt);
    const requestedHHMM = toCaracasHHMM(newScheduledAt);

    const slotsResult = await this.slotsUseCase.execute(appointment.doctorId, dateStr);
    const slot = slotsResult.slots.find((s) => s.time === requestedHHMM);
    if (!slot || !slot.available) {
      throw new AppointmentSlotUnavailableError();
    }

    // Check slot overlap for the new datetime (exclude the appointment itself).
    const hasConflict = await this.appointmentRepo.hasOverlap({
      doctorId: appointment.doctorId,
      scheduledAt: newScheduledAt,
      durationMinutes,
      excludeId: appointment.id,
    });
    if (hasConflict) {
      throw new AppointmentConflictError(newScheduledAt);
    }

    // Persist the new scheduledAt.
    const updated = await this.appointmentRepo.updateScheduledAt(appointment.id, newScheduledAt);

    // Audit log — best-effort.
    // actor_id is UUID NOT NULL without FK; use the doctor's UUID to satisfy
    // the constraint (self-service reschedule is logged under the doctor's id).
    try {
      await this.appointmentRepo.logStatusChange({
        appointmentId: appointment.id,
        actorId: appointment.doctorId,
        oldStatus: appointment.status,
        newStatus: updated.status,
      });
    } catch (err: unknown) {
      this.logger.warn(
        `[reschedule-by-token] audit log failed (non-fatal): ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }

    // Sync consultation date — best-effort.
    if (this.syncConsultationDate) {
      try {
        await this.syncConsultationDate.execute({
          appointmentId: appointment.id,
          doctorId: appointment.doctorId,
          newScheduledAt,
        });
      } catch (err: unknown) {
        this.logger.warn(
          `[reschedule-by-token] syncConsultationDate failed (non-fatal): ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    return this.buildInfo(updated, doctorName);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async loadAndVerify(token: string): Promise<{
    appointment: import('../../../domain/entities/appointment.entity').Appointment;
    doctorName: string;
  }> {
    // 1. Verify token (timing-safe HMAC check)
    const decoded = this.tokenService.verify(token);
    if (!decoded) {
      throw new AppointmentRescheduleInvalidTokenError();
    }

    // 2. Load appointment
    const appointment = await this.appointmentRepo.findById(decoded.appointmentId);
    if (!appointment) {
      throw new AppointmentRescheduleInvalidTokenError();
    }

    // 3. Single-use check: satMs must match current scheduledAt.
    // If the appointment was already rescheduled, satMs != appointment.scheduledAt.getTime().
    if (decoded.satMs !== appointment.scheduledAt.getTime()) {
      throw new AppointmentRescheduleInvalidTokenError();
    }

    // 3b. The link expires when the appointment starts: an old WhatsApp link must
    // not move a past appointment that nobody marked as attended.
    if (appointment.scheduledAt.getTime() <= Date.now()) {
      throw new AppointmentRescheduleInvalidTokenError();
    }

    // 4. Status must allow patient self-service reschedule.
    if (!TOKEN_RESCHEDULABLE_STATUSES.has(appointment.status)) {
      throw new AppointmentNotReschedulableError(appointment.status);
    }

    // 5. Resolve doctor display name (safe, non-PII)
    const doctorProfile = await this.doctorProfileRepo.findByDoctorId(appointment.doctorId);
    const title = doctorProfile?.professionalTitle ?? 'Dr.';
    const name = doctorProfile?.fullName ?? 'Su especialista';
    const doctorName = `${title} ${name}`.trim();

    return { appointment, doctorName };
  }

  private buildInfo(
    appointment: import('../../../domain/entities/appointment.entity').Appointment,
    doctorName: string,
  ): AppointmentRescheduleInfo {
    // First name only — no PII exposure beyond this.
    const patientFirstName = (appointment.patientName ?? '').split(' ')[0] ?? 'Paciente';

    return {
      patientFirstName,
      doctorName,
      date: appointment.scheduledAt.toLocaleDateString('es-VE', {
        timeZone: 'America/Caracas',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      time: appointment.scheduledAt.toLocaleTimeString('es-VE', {
        timeZone: 'America/Caracas',
        hour: '2-digit',
        minute: '2-digit',
      }),
      modality: appointment.appointmentMode,
      officeName: appointment.officeName ?? null,
      currentScheduledAt: appointment.scheduledAt.toISOString(),
      status: appointment.status,
    };
  }
}
