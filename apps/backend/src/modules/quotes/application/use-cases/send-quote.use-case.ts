import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import {
  QUOTE_REPOSITORY,
  type IQuoteRepository,
} from '../../domain/repositories/iquote.repository';
import type { Quote } from '../../domain/entities/quote.entity';
import { QuoteShareLink } from '../../domain/entities/quote-share-link.entity';
import { QuoteNotFoundError } from '../../domain/errors/quote-not-found.error';
import { QuoteAlreadySentError } from '../../domain/errors/quote-already-sent.error';
import { MailerService } from '../../../email/application/services/mailer.service';
import {
  USDT_RATE_STORE,
  type IUsdtRateStore,
} from '../../../finances/domain/repositories/usdt-rate.store';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../doctor-settings/domain/repositories/doctor-profile.repository';

/** Number of days a share link is valid when validUntil is not set on the quote. */
const DEFAULT_LINK_VALIDITY_DAYS = 30;

export interface SendQuoteInput {
  quoteId: string;
  doctorId: string;
  /** Email address to send the link to. If omitted the link is created but not emailed. */
  recipientEmail?: string;
  /** Display name for the email greeting. Defaults to a generic greeting. */
  recipientName?: string;
}

/**
 * SendQuoteUseCase — transitions a draft quote to sent status.
 *
 * Steps:
 *   1. Validate quote exists and is owned (anti-IDOR).
 *   2. Validate quote is in draft (only drafts can be sent).
 *   3. Freeze the current BCV/USDT rate and compute totalBs.
 *   4. Generate a 48-byte base64url share token with a validity window.
 *   5. Persist the share link, freeze rate fields, set status = 'sent'.
 *   6. Send the quote_sent email template to recipientEmail (if provided).
 *
 * The email is sent AFTER the DB write. If the email fails, the quote is
 * still marked as sent — the link can be resent from the UI.
 *
 * SECURITY:
 *   - Token is 48 bytes of CSPRNG encoded as base64url.
 *   - The name in the filename is COT-XXXX, never PII.
 *   - Patient email is encrypted; the frontend must supply recipientEmail
 *     explicitly for patient-targeted quotes.
 */
@Injectable()
export class SendQuoteUseCase {
  private readonly logger = new Logger(SendQuoteUseCase.name);

  constructor(
    @Inject(QUOTE_REPOSITORY)
    private readonly quoteRepo: IQuoteRepository,
    @Inject(USDT_RATE_STORE)
    private readonly rateStore: IUsdtRateStore,
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly doctorProfileRepo: IDoctorProfileRepository,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async execute(input: SendQuoteInput): Promise<Quote> {
    const { quoteId, doctorId, recipientEmail, recipientName } = input;

    // 1. Validate ownership and existence
    const quote = await this.quoteRepo.findByIdForDoctor(quoteId, doctorId);
    if (!quote) {
      throw new QuoteNotFoundError();
    }
    if (!quote.canBeSent()) {
      throw new QuoteAlreadySentError();
    }

    // 2. Resolve doctor's full name from profile (never from the JWT — the JWT
    //    contains the email address, not the display name).
    const doctorProfile = await this.doctorProfileRepo.findByDoctorId(doctorId);
    const doctorName = doctorProfile?.fullName ?? 'Dr./Dra.';

    // 3. Freeze rate at send time (never recalculate later)
    const bcvRate = await this.rateStore.getRate();
    const totalBs = bcvRate !== null ? Math.round(quote.totalUsd * bcvRate * 100) / 100 : null;

    // 4. Generate share link (48-byte CSPRNG, base64url)
    const token = randomBytes(48).toString('base64url');
    const expiresAt = this.computeExpiresAt(quote.validUntil);

    const shareLink = QuoteShareLink.create({
      id: randomUUID(),
      quoteId,
      token,
      expiresAt,
      createdAt: new Date(),
      revokedAt: null,
    });

    // 5. Persist: mark sent + save share link atomically
    const sentQuote = await this.quoteRepo.markAsSent(quoteId, doctorId, {
      bcvRate,
      totalBs,
      shareLink,
    });

    // 6. Send email — non-fatal; log on failure
    if (recipientEmail) {
      await this.sendEmailSafely(sentQuote, shareLink, doctorName, recipientEmail, recipientName);
    } else {
      this.logger.log(
        `[send-quote] quote ${quoteId} sent without email — link created, no email address provided`,
      );
    }

    return sentQuote;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private computeExpiresAt(validUntil: Date | null): Date {
    if (validUntil) {
      // validUntil is date-only — expire at end of that day (23:59:59 UTC)
      const d = new Date(validUntil);
      d.setUTCHours(23, 59, 59, 999);
      return d;
    }
    const d = new Date();
    d.setDate(d.getDate() + DEFAULT_LINK_VALIDITY_DAYS);
    return d;
  }

  private async sendEmailSafely(
    quote: Quote,
    shareLink: QuoteShareLink,
    doctorName: string,
    recipientEmail: string,
    recipientName?: string,
  ): Promise<void> {
    const appUrl = (
      this.config.get<string>('APP_BASE_URL') ??
      this.config.get<string>('FRONTEND_URL') ??
      ''
    ).replace(/\/+$/, '');

    const publicUrl = `${appUrl}/quotes/${shareLink.token}`;
    const greeting = recipientName ?? 'Estimado/a cliente';

    const expiresAtLabel = shareLink.expiresAt.toLocaleDateString('es-VE', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    const totalUsdLabel = quote.totalUsd.toFixed(2);

    try {
      await this.mailer.sendTemplate(
        'quote_sent',
        recipientEmail,
        {
          recipientName: greeting,
          doctorName,
          quoteNumber: quote.quoteNumber,
          url: publicUrl,
          expiresAt: expiresAtLabel,
          totalUsd: totalUsdLabel,
        },
        {
          type: quote.leadId !== null ? 'lead' : 'patient',
          id: quote.leadId ?? quote.patientId ?? 'unknown',
        },
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[send-quote] email delivery failed for quote ${quote.id}: ${msg}`);
      // Do NOT re-throw — the quote is already persisted as sent.
    }
  }
}
