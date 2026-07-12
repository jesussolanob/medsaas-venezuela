import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DOCTOR_REGISTRATION_REPOSITORY,
  type IDoctorRegistrationRepository,
} from '../../domain/repositories/doctor-registration.repository';
import type { DoctorRegistration } from '../../domain/entities/doctor-registration.entity';
import { DoctorRegistrationNotFoundError } from '../../domain/errors/doctor-not-found.error';
import { MailerService } from '../../../email/application/services/mailer.service';
import { VerifyMppsUseCase } from '../../../credential-verification/application/use-cases/verify-mpps.use-case';

export interface CompleteRegistrationInput {
  doctorId: string;
  fullName: string;
  cedula: string;
  mppsNumber?: string | null;
  colegiadoNumber?: string | null;
  specialty?: string | null;
}

export interface CompleteRegistrationOutput {
  doctorId: string;
  verificationStatus: string;
}

/** Sentinel used in template variables when an optional field is absent. */
const NOT_SPECIFIED = 'No especificado';

/**
 * CompleteRegistrationUseCase
 *
 * Called by POST /api/doctor/registration. The doctor submits identity data
 * after their first login (Google SSO / Auth0). The use case:
 *
 *   1. Persists the identity fields + resets verification_status to 'pending'.
 *   2. Fetches all super_admin emails.
 *   3. Dispatches a notification email to every super_admin containing the
 *      doctor's full name, cedula, email, specialty, MPPS number, and
 *      colegiado number.
 *
 * IMPORTANT: Does NOT restrict doctor access — this is preparatory metadata.
 * Email dispatch is fire-and-forget (errors are logged, not re-thrown) so the
 * registration never fails due to a transient email delivery problem.
 *
 * SECURITY: Never log mppsNumber, colegiadoNumber, cedula, fullName, or email.
 * These fields ARE intentionally included in the email body sent to super_admins
 * (admins need them to perform identity verification), but they must NEVER appear
 * in application logs, error traces, or any other observability sink.
 */
@Injectable()
export class CompleteRegistrationUseCase {
  private readonly logger = new Logger(CompleteRegistrationUseCase.name);

  constructor(
    @Inject(DOCTOR_REGISTRATION_REPOSITORY)
    private readonly repo: IDoctorRegistrationRepository,
    private readonly mailer: MailerService,
    private readonly verifyMpps: VerifyMppsUseCase,
    private readonly config: ConfigService,
  ) {}

  async execute(input: CompleteRegistrationInput): Promise<CompleteRegistrationOutput> {
    // 0. Read the prior state BEFORE persisting so we can detect first-time
    //    registration. A missing cedula (null or blank string) means the doctor
    //    has not yet submitted identity data — i.e. this is their first submit.
    //    We use cedula as the sentinel because it is the mandatory identity field
    //    that is always present on a genuine first registration, and it is never
    //    set during the initial profile creation (Auth0 SSO only creates the row
    //    with email/id but no identity fields).
    const prior = await this.repo.findById(input.doctorId);
    const isFirstRegistration = !prior?.cedula || prior.cedula.trim() === '';

    // 1. Persist registration data (idempotent — updates if already submitted)
    const updated = await this.repo.updateRegistration(input.doctorId, {
      fullName: input.fullName,
      cedula: input.cedula,
      mppsNumber: input.mppsNumber ?? null,
      colegiadoNumber: input.colegiadoNumber ?? null,
      specialty: input.specialty ?? null,
    });

    if (!updated) {
      throw new DoctorRegistrationNotFoundError(input.doctorId);
    }

    this.logger.log(`[registration] profile updated doctorId=${input.doctorId}`);

    // 2. Dispatch MPPS credential verification — fire-and-forget
    // Registration MUST NOT fail if SACS is unavailable.
    this.verifyMpps.execute(input.doctorId).catch((err: unknown) => {
      this.logger.error(
        `[registration] mpps verification failed for doctorId=${input.doctorId}`,
        err instanceof Error ? err.message : String(err),
      );
    });

    // 3. Notify all super_admins — fire-and-forget
    this.notifySuperAdmins(updated).catch((err: unknown) => {
      this.logger.error(
        `[registration] failed to notify super_admins for doctorId=${input.doctorId}`,
        err instanceof Error ? err.message : String(err),
      );
    });

    // 4. Send onboarding welcome email on first registration — fire-and-forget.
    //    Gated to isFirstRegistration so re-submits (idempotent updates) never
    //    trigger a duplicate welcome. Also requires a destination email address.
    //    SECURITY: doctorId only in the log — never log email/fullName.
    if (isFirstRegistration && updated.email) {
      const appUrl = (
        this.config.get<string>('APP_BASE_URL') ??
        this.config.get<string>('FRONTEND_URL') ??
        ''
      ).replace(/\/+$/, '');

      this.mailer
        .sendTemplate(
          'welcome',
          updated.email,
          { doctorName: updated.fullName || 'Doctor', appUrl },
          { type: 'doctor', id: updated.id },
        )
        .catch((err: unknown) => {
          this.logger.error(
            `[registration] failed to send welcome email for doctorId=${input.doctorId}`,
            err instanceof Error ? err.message : String(err),
          );
        });

      this.logger.log(`[registration] welcome email dispatched for doctorId=${input.doctorId}`);
    }

    return {
      doctorId: updated.id,
      verificationStatus: updated.verificationStatus,
    };
  }

  private async notifySuperAdmins(registration: DoctorRegistration): Promise<void> {
    const admins = await this.repo.findAllSuperAdmins();

    if (admins.length === 0) {
      this.logger.warn('[registration] no super_admin profiles found — skipping notification');
      return;
    }

    const emails = admins.map((a) => a.email);

    await this.mailer.sendTemplate(
      'doctor_pending_verification',
      emails,
      {
        doctorId: registration.id,
        fullName: registration.fullName || NOT_SPECIFIED,
        doctorEmail: registration.email || NOT_SPECIFIED,
        cedula: registration.cedula || NOT_SPECIFIED,
        specialty: registration.specialty || NOT_SPECIFIED,
        mppsNumber: registration.mppsNumber || NOT_SPECIFIED,
        colegiadoNumber: registration.colegiadoNumber || NOT_SPECIFIED,
      },
      { type: 'admin', id: null },
    );

    this.logger.log(
      `[registration] verification notification dispatched to ${admins.length} admin(s)`,
    );
  }
}
