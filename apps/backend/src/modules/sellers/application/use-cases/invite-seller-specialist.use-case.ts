import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import {
  SELLER_REPOSITORY,
  type ISellerRepository,
  type SellerSpecialistRow,
} from '../../domain/repositories/seller.repository';
import { SpecialistCedulaConflictError } from '../../domain/errors/specialist-cedula-conflict.error';
import { MailerService } from '../../../email/application/services/mailer.service';

export interface InviteSellerSpecialistInput {
  /** Profile id of the authenticated seller — from CurrentUser().sub, never the body. */
  sellerId: string;
  firstName: string;
  lastName: string;
  /** Venezuelan cédula in V/E/P-<value> format. Required for duplicate detection. */
  cedula: string;
  /** Phone number. Required for seller follow-up. SECURITY: PII — do NOT log. */
  phone: string;
  /**
   * Email address for login and invitation email.
   * Required: without an email the specialist can never log in via Auth0, so the
   * profile would be permanently orphaned. The invitation email is sent here.
   * SECURITY: PII — do NOT log.
   */
  email: string;
  specialty?: string | null;
}

export interface InviteSellerSpecialistResult {
  specialist: SellerSpecialistRow;
  invitationEmailSent: boolean;
}

/**
 * InviteSellerSpecialistUseCase
 *
 * A seller pre-registers a specialist by filling in their details.
 * The specialist receives an invitation email with login instructions.
 * When they first log in via Auth0, the resolve-identity service finds the
 * pre-created profile by email and skips duplicate creation.
 *
 * Business rules:
 *   1. cédula uniqueness — checked before INSERT; no DB constraint.
 *      Throws SpecialistCedulaConflictError (409) on collision.
 *   2. email uniqueness — enforced by the repository
 *      (throws SpecialistEmailConflictError → 409).
 *   3. full_name is built as `${firstName} ${lastName}`.
 *   4. sold_by is always the authenticated seller (from session).
 *   5. Plan is always 'free_trial' — sellers cannot assign paid plans.
 *   6. onboarding_last_step = 'profile' so the wizard starts at the office step.
 *   7. Email failure NEVER fails the specialist creation — returns
 *      invitationEmailSent: false instead.
 *
 * SECURITY:
 *   - sellerId comes from the verified CurrentUserPayload.sub.
 *   - NEVER log fullName, email, cedula, or phone (PII).
 *   - Log only sellerId and specialist id on failure.
 */
@Injectable()
export class InviteSellerSpecialistUseCase {
  private readonly logger = new Logger(InviteSellerSpecialistUseCase.name);

  constructor(
    @Inject(SELLER_REPOSITORY)
    private readonly sellerRepo: ISellerRepository,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async execute(input: InviteSellerSpecialistInput): Promise<InviteSellerSpecialistResult> {
    // 1. Guard: check cedula uniqueness before the INSERT.
    //    NEVER log the cedula value.
    const existing = await this.sellerRepo.findByCedula(input.cedula);
    if (existing) {
      throw new SpecialistCedulaConflictError();
    }

    // 2. Build the canonical full name.
    const fullName = `${input.firstName.trim()} ${input.lastName.trim()}`.trim();
    const specialistId = randomUUID();

    // 3. Create the profile. The repo checks email uniqueness and throws
    //    SpecialistEmailConflictError (409) on collision.
    const specialist = await this.sellerRepo.createSoldSpecialist({
      id: specialistId,
      fullName,
      email: input.email.toLowerCase().trim(),
      specialty: input.specialty ?? null,
      cedula: input.cedula,
      phone: input.phone,
      plan: 'free_trial',
      soldBy: input.sellerId,
      // Profile step is considered done (seller filled it in).
      // The wizard will start at the office step on first login.
      onboardingLastStep: 'profile',
    });

    // 4. Send invitation email — always (email is required). Non-fatal: a mailer
    //    failure logs sellerId+specialistId only and returns false. The specialist
    //    profile is already created and the seller can resend manually.
    const invitationEmailSent = await this.sendInvitationEmail(
      specialist,
      input.email,
      input.firstName,
      input.sellerId,
    );

    return { specialist, invitationEmailSent };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Sends the specialist_invitation template.
   * Returns true on success, false on any failure.
   * Never throws — email failure must not block specialist creation.
   * NEVER logs email, fullName, or cedula — only sellerId + specialistId.
   */
  private async sendInvitationEmail(
    specialist: SellerSpecialistRow,
    email: string,
    firstName: string,
    sellerId: string,
  ): Promise<boolean> {
    try {
      const frontendUrl = this.buildFrontendUrl();
      const loginUrl = `${frontendUrl}/login`;

      await this.mailer.sendTemplate(
        'specialist_invitation',
        email,
        {
          specialistName: firstName,
          loginUrl,
        },
        { type: 'doctor', id: specialist.id },
      );

      return true;
    } catch (err: unknown) {
      // Log ids only — no email, name, cedula, or phone in logs.
      this.logger.warn(
        `[invite-seller-specialist] invitation email failed for` +
          ` specialist=${specialist.id} seller=${sellerId}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
      return false;
    }
  }

  private buildFrontendUrl(): string {
    return (
      this.config.get<string>('APP_BASE_URL') ??
      this.config.get<string>('FRONTEND_URL') ??
      ''
    ).replace(/\/+$/, '');
  }
}
