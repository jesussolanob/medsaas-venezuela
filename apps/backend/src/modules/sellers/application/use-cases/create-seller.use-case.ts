import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'crypto';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import {
  SELLER_REPOSITORY,
  type ISellerRepository,
  type SellerProfile,
} from '../../domain/repositories/seller.repository';
import { MailerService } from '../../../email/application/services/mailer.service';

/**
 * Alphanumeric characters that are unambiguous when read aloud or typed by hand.
 *
 * Excluded:
 *   0 (zero)  — looks like O
 *   O         — looks like 0 or Q on small screens
 *   1 (one)   — looks like l or I
 *   l         — looks like 1 or I
 *   I         — looks like 1 or l
 */
const SAFE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const CODE_LENGTH = 6;
const MAX_RETRIES = 10;

/** Generates a random seller code of CODE_LENGTH safe characters. */
function randomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += SAFE_CHARS[randomInt(0, SAFE_CHARS.length)];
  }
  return code;
}

export interface CreateSellerInput {
  fullName: string;
  email: string;
}

/**
 * Output from CreateSellerUseCase.execute.
 *
 * Includes the created SellerProfile and whether the welcome email was sent
 * successfully so the admin UI can inform the admin immediately.
 *
 * An email failure NEVER rolls back or fails the seller creation: the seller
 * is always created if the repo write succeeds. `welcomeEmailSent: false`
 * signals to the admin that a manual resend may be needed.
 */
export interface CreateSellerResult {
  seller: SellerProfile;
  welcomeEmailSent: boolean;
}

/**
 * CreateSellerUseCase
 *
 * Admin-only. Creates a new seller profile and sends the welcome email:
 *   1. Generates a short unique seller_code (retries on collision, up to
 *      MAX_RETRIES times).
 *   2. Delegates the write to ISellerRepository, which creates the profile with
 *      role = 'seller'.
 *   3. Sends a `seller_welcome` email via MailerService with login instructions,
 *      referral code, and portal overview.
 *   4. Email failures are caught, logged (seller id only — no PII), and reported
 *      in the result. They NEVER fail or roll back the seller creation.
 *
 * Security:
 *   - seller_code is generated server-side; the client never supplies it.
 *   - Sellers cannot choose their own plan — they are not subscription holders.
 *   - Callers must guard this use case with @Roles('super_admin'): solo el super
 *     administrador gestiona vendedores (decisión del dueño, 2026-08-17).
 *   - NEVER log fullName, email, or sellerCode — only the seller id.
 */
@Injectable()
export class CreateSellerUseCase {
  private readonly logger = new Logger(CreateSellerUseCase.name);

  constructor(
    @Inject(SELLER_REPOSITORY)
    private readonly sellerRepo: ISellerRepository,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async execute(input: CreateSellerInput): Promise<CreateSellerResult> {
    const sellerCode = await this.generateUniqueCode();

    const seller = await this.sellerRepo.createSeller({
      id: randomUUID(),
      fullName: input.fullName,
      email: input.email.toLowerCase().trim(),
      sellerCode,
    });

    const welcomeEmailSent = await this.sendWelcomeEmail(seller);

    return { seller, welcomeEmailSent };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const code = randomCode();
      const taken = await this.sellerRepo.codeExists(code);
      if (!taken) return code;
    }
    // Extremely unlikely given the search space (32^6 ≈ 1B combinations).
    throw new Error(
      `[CreateSellerUseCase] could not generate a unique seller_code after ${MAX_RETRIES} retries`,
    );
  }

  /**
   * Sends the seller_welcome template.
   * Returns true on success, false on any failure.
   * Never throws — email failure must not block seller creation.
   * NEVER logs email, fullName, or sellerCode — only the seller id.
   */
  private async sendWelcomeEmail(seller: SellerProfile): Promise<boolean> {
    try {
      const frontendUrl = this.buildFrontendUrl();
      const loginUrl = `${frontendUrl}/login`;
      const referralUrl = `${frontendUrl}/r/${seller.sellerCode}`;

      await this.mailer.sendTemplate(
        'seller_welcome',
        seller.email,
        {
          sellerName: seller.fullName,
          sellerEmail: seller.email,
          sellerCode: seller.sellerCode,
          referralUrl,
          loginUrl,
        },
        { type: 'seller', id: seller.id },
      );

      return true;
    } catch (err: unknown) {
      // Log id only — no email, name, or code in logs.
      this.logger.warn(
        `[create-seller] welcome email failed for seller=${seller.id}: ` +
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
