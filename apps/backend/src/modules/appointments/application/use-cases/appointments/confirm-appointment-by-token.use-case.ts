import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  APPOINTMENT_REPOSITORY,
  type IAppointmentRepository,
} from '../../../domain/repositories/appointment.repository';
import { AppointmentConfirmTokenService } from '../../../infrastructure/services/appointment-confirm-token.service';
import { AppointmentConfirmInvalidTokenError } from '../../../domain/errors/appointment-confirm-invalid-token.error';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../../doctor-settings/domain/repositories/doctor-profile.repository';
import type { AppointmentPublicInfo } from './get-appointment-confirm-info.use-case';

/** Terminal statuses — confirming these is a non-fatal no-op. */
const TERMINAL_STATUSES = ['cancelled', 'completed', 'no_show'] as const;
type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

function isTerminal(status: string): status is TerminalStatus {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

/**
 * ConfirmAppointmentByTokenUseCase
 *
 * Verifies a stateless HMAC token and transitions the appointment from
 * `scheduled` → `confirmed` using the existing domain transition guard.
 *
 * Idempotency:
 *   - Already `confirmed` → returns success (no double-write).
 *   - Terminal status (cancelled/completed/no_show) → returns current status info
 *     (non-error; the frontend renders a "this appointment is no longer active" page).
 *
 * SECURITY:
 *   - HMAC token verified before any DB access.
 *   - Actor is recorded as 'system' in the changes log (no authenticated user).
 *   - Response contains only safe non-PII fields.
 *   - Invalid tokens → 404 (anti-enumeration).
 */
@Injectable()
export class ConfirmAppointmentByTokenUseCase {
  private readonly logger = new Logger(ConfirmAppointmentByTokenUseCase.name);

  constructor(
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: IAppointmentRepository,
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly doctorProfileRepo: IDoctorProfileRepository,
    private readonly tokenService: AppointmentConfirmTokenService,
  ) {}

  async execute(token: string): Promise<AppointmentPublicInfo> {
    // 1. Verify token (timing-safe HMAC check)
    const appointmentId = this.tokenService.verify(token);
    if (!appointmentId) {
      throw new AppointmentConfirmInvalidTokenError();
    }

    // 2. Load appointment
    const appointment = await this.appointmentRepo.findById(appointmentId);
    if (!appointment) {
      throw new AppointmentConfirmInvalidTokenError();
    }

    // 3. Resolve doctor name (safe, non-PII)
    const doctorProfile = await this.doctorProfileRepo.findByDoctorId(appointment.doctorId);
    const doctorName = doctorProfile?.fullName ?? 'Su especialista';

    const buildInfo = (status: string): AppointmentPublicInfo => ({
      status,
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
    });

    // 4. Idempotent: already confirmed
    if (appointment.status === 'confirmed') {
      return buildInfo('confirmed');
    }

    // 5. Terminal status — return info with current status (not an error)
    if (isTerminal(appointment.status)) {
      return buildInfo(appointment.status);
    }

    // 6. Validate transition (scheduled → confirmed)
    if (!appointment.canTransitionTo('confirmed')) {
      // Unexpected status (legacy pending/accepted) — treat as terminal
      return buildInfo(appointment.status);
    }

    // 7. Persist transition
    await this.appointmentRepo.updateStatus(appointmentId, 'confirmed');

    // 8. Audit log — best-effort. If the log write fails the patient already
    //    received a confirmed appointment; do NOT surface the audit failure as
    //    a 500 on a public endpoint. Log a warning without PII.
    try {
      await this.appointmentRepo.logStatusChange({
        appointmentId,
        actorId: 'system',
        oldStatus: appointment.status,
        newStatus: 'confirmed',
      });
    } catch (auditErr: unknown) {
      this.logger.warn(
        `[confirm-by-token] audit log failed (non-fatal): ` +
          (auditErr instanceof Error ? auditErr.message : String(auditErr)),
      );
    }

    this.logger.debug(
      `[confirm-by-token] appointment=${appointmentId} transitioned scheduled→confirmed via public token`,
    );

    return buildInfo('confirmed');
  }
}
