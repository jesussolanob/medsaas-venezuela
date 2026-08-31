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
import {
  LEGAL_DOCUMENT_REPOSITORY,
  type ILegalDocumentRepository,
} from '../../../legal/domain/repositories/legal-document.repository';
import {
  SELLER_REPOSITORY,
  type ISellerRepository,
} from '../../../sellers/domain/repositories/seller.repository';
import { SellerCodeNotFoundError } from '../../../sellers/domain/errors/seller-code-not-found.error';

export interface CompleteRegistrationInput {
  doctorId: string;
  fullName: string;
  cedula: string;
  /** Teléfono de contacto — obligatorio: es como Delta contacta al especialista. */
  phone: string;
  mppsNumber?: string | null;
  colegiadoNumber?: string | null;
  specialty?: string | null;
  /** F | M | O | N. Statistical only — never gates access. */
  gender?: string | null;
  /** When true, persists terms acceptance (timestamp + version) on the profile. */
  acceptedTerms?: boolean;
  /**
   * Optional seller code submitted during the onboarding wizard.
   * When present, the use case resolves it to a seller profile and writes
   * sold_by on the doctor's profile — but only if sold_by is currently null.
   *
   * Throws SellerCodeNotFoundError (422) when the code does not match any
   * active seller.
   */
  sellerCode?: string | null;
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
 *   1. Persists the identity fields. Sends verification_status back to 'pending'
 *      ONLY when an identity document changed (or on first registration): un
 *      reenvío con los mismos datos conserva la verificación del admin.
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
    @Inject(LEGAL_DOCUMENT_REPOSITORY)
    private readonly legalRepo: ILegalDocumentRepository,
    @Inject(SELLER_REPOSITORY)
    private readonly sellerRepo: ISellerRepository,
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

    // La verificación del admin es sobre los documentos de identidad, así que
    // solo queda obsoleta si cambia alguno de ellos. Un reenvío con los mismos
    // datos —lo que pasa al volver al wizard— debe conservar la verificación.
    const identityChanged =
      isFirstRegistration ||
      normalise(prior?.cedula) !== normalise(input.cedula) ||
      normalise(prior?.mppsNumber) !== normalise(input.mppsNumber) ||
      normalise(prior?.colegiadoNumber) !== normalise(input.colegiadoNumber);

    // 1. Persist registration data (idempotent — updates if already submitted)
    const updated = await this.repo.updateRegistration(input.doctorId, {
      fullName: input.fullName,
      cedula: input.cedula,
      phone: input.phone,
      mppsNumber: input.mppsNumber ?? null,
      colegiadoNumber: input.colegiadoNumber ?? null,
      specialty: input.specialty ?? null,
      gender: input.gender ?? null,
      resetVerification: identityChanged,
    });

    if (!updated) {
      throw new DoctorRegistrationNotFoundError(input.doctorId);
    }

    this.logger.log(`[registration] profile updated doctorId=${input.doctorId}`);

    // 1b. Seller attribution — only on first registration with a seller_code.
    //
    //     Invariant: sold_by is written at most once. The repository's linkSoldBy
    //     implementation uses WHERE sold_by IS NULL so a second onboarding visit
    //     with a different code (or no code) can never overwrite the original
    //     attribution.
    //
    //     This step runs synchronously before the fire-and-forget tasks so that
    //     a failed DB write (UniqueConstraintError, etc.) still surfaces to the
    //     client as a 422, which is the correct behaviour.
    if (input.sellerCode) {
      const seller = await this.sellerRepo.findByCode(input.sellerCode.toUpperCase().trim());
      if (!seller) {
        throw new SellerCodeNotFoundError();
      }
      await this.sellerRepo.linkSoldBy(input.doctorId, seller.id);
      this.logger.log(`[registration] seller linked doctorId=${input.doctorId}`);
    }

    // 2. Persist terms acceptance — fire-and-forget (never fails registration).
    //    Only runs when the client explicitly sends accepted_terms: true.
    if (input.acceptedTerms === true) {
      this.persistTermsAcceptance(input.doctorId).catch((err: unknown) => {
        this.logger.error(
          `[registration] failed to persist terms acceptance for doctorId=${input.doctorId}`,
          err instanceof Error ? err.message : String(err),
        );
      });
    }

    // 4. Dispatch MPPS credential verification — fire-and-forget
    // Registration MUST NOT fail if SACS is unavailable.
    this.verifyMpps.execute(input.doctorId).catch((err: unknown) => {
      this.logger.error(
        `[registration] mpps verification failed for doctorId=${input.doctorId}`,
        err instanceof Error ? err.message : String(err),
      );
    });

    // 5. Notify all super_admins — fire-and-forget
    this.notifySuperAdmins(updated).catch((err: unknown) => {
      this.logger.error(
        `[registration] failed to notify super_admins for doctorId=${input.doctorId}`,
        err instanceof Error ? err.message : String(err),
      );
    });

    // 6. Send onboarding welcome email on first registration — fire-and-forget.
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

  /**
   * Looks up the current T&C version and writes the acceptance record to the profile.
   * Fire-and-forget: called without await so registration is not blocked.
   * If no current terms document exists, the acceptance is silently skipped.
   */
  private async persistTermsAcceptance(doctorId: string): Promise<void> {
    const termsDoc = await this.legalRepo.findCurrentByType('terms');
    if (!termsDoc) {
      this.logger.warn(
        `[registration] no current terms document found — skipping acceptance for doctorId=${doctorId}`,
      );
      return;
    }

    await this.repo.acceptTerms(doctorId, {
      acceptedAt: new Date(),
      version: termsDoc.version,
    });

    this.logger.log(
      `[registration] terms acceptance persisted version=${termsDoc.version} doctorId=${doctorId}`,
    );
  }

  /**
   * URL publica de la app, sin la barra final.
   *
   * Cae a deltasalud.app cuando no hay nada configurado: el correo de
   * verificacion lleva un enlace y un href vacio no le sirve a nadie.
   */
  private appBaseUrl(): string {
    const configured = (
      this.config.get<string>('APP_BASE_URL') ??
      this.config.get<string>('FRONTEND_URL') ??
      ''
    ).replace(/\/+$/, '');
    return /^https?:\/\//i.test(configured) ? configured : 'https://deltasalud.app';
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
        panelUrl: `${this.appBaseUrl()}/admin/verifications`,
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

/**
 * Normalises an identity field for comparison: null, undefined and blank all
 * collapse to the same value, and surrounding whitespace is ignored.
 *
 * Without this, re-submitting the wizard with an untouched optional field that
 * the client sends as '' instead of null would read as a change and needlessly
 * de-verify the specialist.
 */
function normalise(value: string | null | undefined): string {
  return (value ?? '').trim();
}
