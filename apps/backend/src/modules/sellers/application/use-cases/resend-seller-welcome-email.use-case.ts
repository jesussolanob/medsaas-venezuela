import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SELLER_REPOSITORY,
  type ISellerRepository,
} from '../../domain/repositories/seller.repository';
import { MailerService } from '../../../email/application/services/mailer.service';
import { SellerNotFoundError } from '../../domain/errors/seller-not-found.error';

export interface ResendSellerWelcomeEmailResult {
  sent: boolean;
}

/**
 * ResendSellerWelcomeEmailUseCase
 *
 * Admin-only. Re-sends the `seller_welcome` email to an existing seller.
 *
 * Use cases:
 *   - The initial send failed when the seller was created.
 *   - The seller deleted the email and needs it again.
 *   - The admin created the seller before the welcome-email feature was deployed.
 *
 * Rules:
 *   - Throws SellerNotFoundError (404) when no seller profile exists for the id.
 *   - Returns `{ sent: false }` when MailerService fails (same non-fatal pattern
 *     as CreateSellerUseCase — the admin sees the outcome and can retry).
 *   - NEVER logs email, fullName, or sellerCode — only the seller id.
 *
 * Security:
 *   - Callers must guard this use case with @Roles('super_admin').
 *   - sellerId always comes from the URL param (validated as UUID by ParseUUIDPipe).
 */
@Injectable()
export class ResendSellerWelcomeEmailUseCase {
  private readonly logger = new Logger(ResendSellerWelcomeEmailUseCase.name);

  constructor(
    @Inject(SELLER_REPOSITORY)
    private readonly sellerRepo: ISellerRepository,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async execute(sellerId: string): Promise<ResendSellerWelcomeEmailResult> {
    const seller = await this.sellerRepo.findById(sellerId);
    if (!seller) {
      throw new SellerNotFoundError();
    }

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

      return { sent: true };
    } catch (err: unknown) {
      // Log id only — no email, name, or code in logs.
      this.logger.warn(
        `[resend-seller-welcome] email failed for seller=${sellerId}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
      return { sent: false };
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
