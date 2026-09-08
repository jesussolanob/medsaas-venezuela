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
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../patients/domain/repositories/patient.repository';
import {
  LEAD_REPOSITORY,
  type ILeadRepository,
} from '../../../leads/domain/repositories/lead.repository';

/** Number of days a share link is valid when validUntil is not set on the quote. */
const DEFAULT_LINK_VALIDITY_DAYS = 30;

export interface SendQuoteInput {
  quoteId: string;
  doctorId: string;
  /**
   * Email address to send the link to. When omitted, the use case resolves it
   * from the recipient's own record (patient.email / lead.email) — the
   * specialist should never have to retype an address already on file.
   * An explicit value here always wins over the resolved one.
   */
  recipientEmail?: string;
  /**
   * Display name for the email greeting. When omitted, resolved from the
   * recipient's own record, same as recipientEmail.
   */
  recipientName?: string;
}

/**
 * Reason the confirmation email was not sent. Null when it was sent
 * successfully. Surfaced to the controller so the specialist is told — the
 * share link is still created and usable either way.
 */
export type SendQuoteEmailSkipReason = 'no_recipient_email' | 'delivery_failed';

export interface SendQuoteResult {
  quote: Quote;
  /** True only when sendTemplate() resolved without throwing. */
  emailSent: boolean;
  /** Why the email was not sent. Null when emailSent is true. */
  emailSkipReason: SendQuoteEmailSkipReason | null;
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
 *   6. Resolve the recipient's email/name (explicit input wins; otherwise
 *      read from the patient/lead record) and send the quote_sent template.
 *
 * The email is sent AFTER the DB write. If the email fails — or there is no
 * address to send it to — the quote is still marked as sent: the share link
 * is always usable, and the caller learns via emailSent/emailSkipReason
 * whether it also needs to hand the link over manually.
 *
 * SECURITY:
 *   - Token is 48 bytes of CSPRNG encoded as base64url.
 *   - The name in the filename is COT-XXXX, never PII.
 *   - Never log the resolved recipient email or name — only IDs.
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
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
    @Inject(LEAD_REPOSITORY)
    private readonly leadRepo: ILeadRepository,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async execute(input: SendQuoteInput): Promise<SendQuoteResult> {
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

    // 6. Resolve the effective recipient (explicit input wins) and send.
    const resolved = await this.resolveRecipient(sentQuote, recipientEmail, recipientName);

    if (!resolved.email) {
      this.logger.log(
        `[send-quote] quote ${quoteId} sent without email — no address on file or provided`,
      );
      return { quote: sentQuote, emailSent: false, emailSkipReason: 'no_recipient_email' };
    }

    const emailSent = await this.sendEmailSafely(
      sentQuote,
      shareLink,
      doctorName,
      resolved.email,
      resolved.name,
    );

    return {
      quote: sentQuote,
      emailSent,
      emailSkipReason: emailSent ? null : 'delivery_failed',
    };
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

  /**
   * Resolves the email/name to send to: an explicit value always wins over
   * whatever is on file, so the specialist can still override a stale or
   * missing address from the send modal.
   *
   * Best-effort: a lookup failure (deleted patient/lead, decrypt error) falls
   * back to whatever was explicitly provided — never throws, since a failed
   * name/email resolution must not block marking the quote as sent.
   */
  private async resolveRecipient(
    quote: Quote,
    explicitEmail: string | undefined,
    explicitName: string | undefined,
  ): Promise<{ email: string | null; name: string | undefined }> {
    if (explicitEmail) {
      return { email: explicitEmail, name: explicitName };
    }

    try {
      if (quote.patientId !== null) {
        const patient = await this.patientRepo.findById(quote.patientId, quote.doctorId);
        return {
          email: patient?.email ?? null,
          name: explicitName ?? patient?.fullName?.trim() ?? undefined,
        };
      }
      if (quote.leadId !== null) {
        const lead = await this.leadRepo.findByIdForDoctor(quote.leadId, quote.doctorId);
        return {
          email: lead?.email ?? null,
          name:
            explicitName ??
            (lead ? [lead.name, lead.lastName].filter(Boolean).join(' ').trim() : undefined) ??
            undefined,
        };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[send-quote] recipient lookup failed for quote ${quote.id}: ${msg}`);
    }

    return { email: null, name: explicitName };
  }

  /** Returns true when the email was sent without throwing. */
  private async sendEmailSafely(
    quote: Quote,
    shareLink: QuoteShareLink,
    doctorName: string,
    recipientEmail: string,
    recipientName?: string,
  ): Promise<boolean> {
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
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[send-quote] email delivery failed for quote ${quote.id}: ${msg}`);
      // Do NOT re-throw — the quote is already persisted as sent.
      return false;
    }
  }
}
