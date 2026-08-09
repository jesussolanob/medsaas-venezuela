import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../domain/repositories/doctor-profile.repository';
import { DoctorProfileNotFoundError } from '../../../domain/errors/doctor-profile-not-found.error';
import { AccountHasUpcomingAppointmentsError } from '../../../domain/errors/account-has-upcoming-appointments.error';
import { CannotDeactivateRoleError } from '../../../domain/errors/cannot-deactivate-role.error';

export interface DeactivateOwnAccountInput {
  doctorId: string;
  /** Role of the caller, taken from the authenticated token — never the body. */
  role: string;
  reason?: string | null;
}

export interface DeactivateOwnAccountOutput {
  deactivated: true;
}

/**
 * DeactivateOwnAccountUseCase — a specialist switches their own account off
 * from Configuración.
 *
 * This is a DEACTIVATION, never a deletion. Every row the specialist produced
 * (patients, consultations, clinical history, finances) stays exactly where it
 * is under the same profile id, so the account remains auditable and a
 * super_admin can switch it back on with the button that already exists in the
 * admin panel. Nothing is migrated, nothing is anonymised, no id changes.
 *
 * FLOW:
 *   1. Profile must exist.
 *   2. Role must be 'doctor' — anything else would risk an admin lockout.
 *   3. No appointments booked in the future (blocks with 422 + the count).
 *   4. is_active = false, provenance stamped as 'self'.
 *
 * Why it does not reuse SetDoctorAccessUseCase (admin): that use case forbids
 * acting on your own profile (CannotBlockSelfError) precisely to stop an admin
 * locking themselves out. Self-deactivation is the deliberate opposite, so it
 * reuses the FLAG but needs its own path and its own rules.
 *
 * Enforcement is inherited, not rebuilt: AppAuthGuard already rejects an
 * inactive profile, and the public booking flow already refuses to take
 * appointments for one.
 *
 * SECURITY:
 *   - doctorId always comes from user.sub, never from the request body, so a
 *     caller can only ever deactivate themselves.
 *   - The reason is free text written by the account owner about their own
 *     account — no patient PII — and is never logged.
 */
@Injectable()
export class DeactivateOwnAccountUseCase {
  private readonly logger = new Logger(DeactivateOwnAccountUseCase.name);

  constructor(
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly profileRepo: IDoctorProfileRepository,
  ) {}

  async execute(input: DeactivateOwnAccountInput): Promise<DeactivateOwnAccountOutput> {
    // 1. Specialists only — a super_admin would lock itself out of the panel
    //    that performs reactivation. Checked before any read: the role comes
    //    from the verified token, so this needs no DB round-trip.
    if (input.role !== 'doctor') {
      throw new CannotDeactivateRoleError();
    }

    // 2. Profile must exist.
    const profile = await this.profileRepo.findByDoctorId(input.doctorId);
    if (!profile) {
      throw new DoctorProfileNotFoundError(input.doctorId);
    }

    // 3. Patients holding a future appointment must not be stranded: switching
    //    the account off also takes down the public booking page and locks out
    //    the only person who could cancel or reschedule.
    const upcoming = await this.profileRepo.countUpcomingAppointments(input.doctorId);
    if (upcoming > 0) {
      throw new AccountHasUpcomingAppointmentsError(upcoming);
    }

    // 4. Switch off, recording that the owner did it.
    const reason = normaliseReason(input.reason);
    await this.profileRepo.deactivateOwnAccount(input.doctorId, reason);

    // Deliberate: the id is not PII and this is the audit trail for a support
    // request that starts with "I can't get in".
    this.logger.log(`[deactivation] self doctorId="${input.doctorId}"`);

    return { deactivated: true };
  }
}

/** Blank or whitespace-only reasons are stored as NULL, not as an empty string. */
function normaliseReason(reason: string | null | undefined): string | null {
  if (typeof reason !== 'string') return null;
  const trimmed = reason.trim();
  return trimmed.length > 0 ? trimmed : null;
}
