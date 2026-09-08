import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  QUOTE_REPOSITORY,
  type IQuoteRepository,
} from '../../domain/repositories/iquote.repository';
import type { Quote } from '../../domain/entities/quote.entity';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../patients/domain/repositories/patient.repository';
import {
  LEAD_REPOSITORY,
  type ILeadRepository,
} from '../../../leads/domain/repositories/lead.repository';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../doctor-settings/domain/repositories/doctor-profile.repository';
import { MailerService } from '../../../email/application/services/mailer.service';

/** Max quotes processed per cron invocation. */
const DISPATCH_CAP = 200;

/** Days before valid_until that the "about to expire" notice goes out. */
const EXPIRY_REMINDER_WINDOW_DAYS = 3;

export interface DispatchQuoteExpiryNoticesResult {
  /** Quotes transitioned status='sent' → 'expired' this run (no email). */
  quotesExpired: number;
  /** "About to expire" reminder emails dispatched (recipient and/or doctor). */
  quoteExpiryRemindersSent: number;
  /** Quotes where the reminder step raised an unhandled error. */
  quoteExpiryRemindersFailed: number;
}

/**
 * DispatchQuoteExpiryNoticesUseCase
 *
 * Called by the cron endpoint POST /api/cron/appointment-reminders (best-effort
 * sub-task, same pattern as DispatchPendingConsultationRemindersUseCase). There
 * is no dedicated Cloud Scheduler job for this — see the controller's JSDoc.
 *
 * A single candidate fetch (IQuoteRepository.findQuotesNearingExpiry) covers
 * both responsibilities; this use case decides, per quote, which applies:
 *
 *   A. Expiry sweep (silent, no email):
 *      validUntil < now → status='expired' via the repository's existing
 *      updateStatus(id, doctorId, 'expired', expectedStatus='sent'), which
 *      already guards against a concurrent status change (optimistic
 *      concurrency — same mechanism UpdateQuoteStatusUseCase relies on).
 *      Idempotent: a quote already 'expired' is never returned as a
 *      candidate whose status is still 'sent', so it is simply skipped.
 *
 *   B. "About to expire" reminder (one recipient email + one doctor email):
 *      Quote.isDueForExpiryReminder(now, 3 days) → true. The recipient
 *      (patient or lead) gets the public link; the specialist gets a nudge
 *      that the quote is about to expire and has not been answered yet.
 *      expiry_reminder_sent_at is stamped AFTER the send attempt(s) — even
 *      when the recipient has no email on file or delivery fails — so the
 *      sweep never retries the same quote forever.
 *
 * Every candidate is processed in its own try/catch: one quote's mailer
 * failure (step B) never blocks another quote's expiry transition (step A)
 * in the same run, and never aborts the batch.
 *
 * Recipient address limitation (documented per product decision):
 *   The recipient's email is always resolved from the patient/lead record at
 *   send time — same as SendQuoteUseCase.resolveRecipient(). If the specialist
 *   typed a different, one-off address in the "send" modal (SendQuoteInput.
 *   recipientEmail), that value is NOT persisted anywhere today, so this
 *   reminder cannot reach it. Adding a column to store it was deliberately
 *   rejected: it would be an unencrypted copy of patient PII (the email is
 *   already AES-256-GCM encrypted on the patient record). If the ficha has no
 *   email, the recipient reminder is silently skipped — the doctor email
 *   still goes out regardless, since that is exactly when the specialist most
 *   needs the nudge.
 *
 * PII: never logged. Only quote ids (not patient/lead ids) and counts.
 */
@Injectable()
export class DispatchQuoteExpiryNoticesUseCase {
  private readonly logger = new Logger(DispatchQuoteExpiryNoticesUseCase.name);

  constructor(
    @Inject(QUOTE_REPOSITORY)
    private readonly quoteRepo: IQuoteRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
    @Inject(LEAD_REPOSITORY)
    private readonly leadRepo: ILeadRepository,
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly doctorProfileRepo: IDoctorProfileRepository,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async execute(nowOverride?: Date): Promise<DispatchQuoteExpiryNoticesResult> {
    const now = nowOverride ?? new Date();
    const windowEnd = new Date(now.getTime() + EXPIRY_REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const candidates = await this.quoteRepo.findQuotesNearingExpiry(windowEnd, DISPATCH_CAP);

    if (candidates.length === DISPATCH_CAP) {
      this.logger.warn(
        `[quote-expiry] cap reached (${DISPATCH_CAP}). Some may be deferred to next run.`,
      );
    }

    let quotesExpired = 0;
    let remindersSent = 0;
    let remindersFailed = 0;

    for (const quote of candidates) {
      try {
        const outcome = await this.processOne(quote, now);
        if (outcome === 'expired') quotesExpired++;
        else if (outcome === 'reminder_sent') remindersSent++;
      } catch (err: unknown) {
        remindersFailed++;
        this.logger.warn(
          `[quote-expiry] unhandled error for quote=${quote.id}: ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    this.logger.log(
      `[quote-expiry] expired=${quotesExpired} remindersSent=${remindersSent} remindersFailed=${remindersFailed}`,
    );

    return {
      quotesExpired,
      quoteExpiryRemindersSent: remindersSent,
      quoteExpiryRemindersFailed: remindersFailed,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async processOne(
    quote: Quote,
    now: Date,
  ): Promise<'expired' | 'reminder_sent' | 'skipped'> {
    // Defense in depth: never trust the repository's WHERE clause alone —
    // same reasoning as isOwnedBy() re-checking ownership after a lookup.
    if (quote.status !== 'sent') return 'skipped';
    if (quote.validUntil === null) return 'skipped';

    // A. Overdue → expire. No email (owner only asked for the pre-expiry notice).
    if (quote.validUntil < now) {
      try {
        await this.quoteRepo.updateStatus(quote.id, quote.doctorId, 'expired', 'sent');
        return 'expired';
      } catch (err: unknown) {
        // Lost a race with a concurrent status change (e.g. the recipient just
        // accepted it) — not a failure of this sweep, just a no-op this run.
        this.logger.warn(
          `[quote-expiry] could not expire quote=${quote.id}: ` +
            (err instanceof Error ? err.message : String(err)),
        );
        return 'skipped';
      }
    }

    // B. About to expire → reminder (idempotency check lives in the predicate).
    if (quote.isDueForExpiryReminder(now, EXPIRY_REMINDER_WINDOW_DAYS)) {
      const dispatched = await this.processReminder(quote, now);
      return dispatched ? 'reminder_sent' : 'skipped';
    }

    return 'skipped';
  }

  /**
   * Sends the recipient email (best-effort) and the doctor email
   * (best-effort), then stamps expiry_reminder_sent_at regardless of either
   * outcome. Returns true when at least one email was dispatched without
   * throwing — used only for the aggregate counter.
   */
  private async processReminder(quote: Quote, now: Date): Promise<boolean> {
    const doctorProfile = await this.doctorProfileRepo.findByDoctorId(quote.doctorId);
    const doctorName = doctorProfile?.fullName ?? 'Su especialista';
    // validUntil is guaranteed non-null here — processOne() already checked it.
    const validUntilLabel = this.formatCaracas(quote.validUntil as Date);
    const totalUsdLabel = quote.totalUsd.toFixed(2);

    const recipient = await this.resolveRecipient(quote);
    let recipientSent = false;

    if (recipient.email) {
      const quoteUrl = this.buildQuoteUrl(quote);
      if (quoteUrl) {
        try {
          await this.mailer.sendTemplate(
            'quote_expiring_recipient',
            recipient.email,
            {
              recipientName: recipient.name ?? 'Estimado/a cliente',
              doctorName,
              quoteNumber: quote.quoteNumber,
              validUntil: validUntilLabel,
              quoteUrl,
            },
            {
              type: quote.leadId !== null ? 'lead' : 'patient',
              id: quote.leadId ?? quote.patientId ?? 'unknown',
            },
          );
          recipientSent = true;
        } catch (err: unknown) {
          this.logger.warn(
            `[quote-expiry] recipient email failed for quote=${quote.id}: ` +
              (err instanceof Error ? err.message : String(err)),
          );
        }
      } else {
        // No active share link — should not happen for a 'sent' quote, but
        // never block the doctor notice on it.
        this.logger.warn(`[quote-expiry] no active share link for quote=${quote.id}`);
      }
    }

    // The doctor email is always attempted, even when the recipient has no
    // address — that is exactly when the specialist most needs the nudge.
    let doctorSent = false;
    if (doctorProfile?.email) {
      try {
        await this.mailer.sendTemplate(
          'quote_expiring_doctor',
          doctorProfile.email,
          {
            doctorName,
            quoteNumber: quote.quoteNumber,
            recipientName: recipient.name ?? 'el destinatario',
            validUntil: validUntilLabel,
            totalUsd: totalUsdLabel,
          },
          { type: 'doctor', id: quote.doctorId },
        );
        doctorSent = true;
      } catch (err: unknown) {
        this.logger.warn(
          `[quote-expiry] doctor email failed for quote=${quote.id}: ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    // Stamp regardless of outcome — an attempt was made either way, and
    // retrying forever would spam on every 15-minute run.
    await this.quoteRepo.markExpiryReminderSent(quote.id, now);

    return recipientSent || doctorSent;
  }

  /**
   * Resolves the recipient's email/name from the patient or lead record.
   * Best-effort: a lookup failure (deleted patient/lead, decrypt error) is
   * swallowed — the reminder must not crash the whole batch over one bad row.
   *
   * KNOWN LIMITATION: does not see a one-off address the specialist typed in
   * the send modal (SendQuoteInput.recipientEmail) — see class JSDoc.
   */
  private async resolveRecipient(
    quote: Quote,
  ): Promise<{ email: string | null; name: string | null }> {
    try {
      if (quote.patientId !== null) {
        const patient = await this.patientRepo.findById(quote.patientId, quote.doctorId);
        return { email: patient?.email ?? null, name: patient?.fullName?.trim() ?? null };
      }
      if (quote.leadId !== null) {
        const lead = await this.leadRepo.findByIdForDoctor(quote.leadId, quote.doctorId);
        return {
          email: lead?.email ?? null,
          name: lead ? [lead.name, lead.lastName].filter(Boolean).join(' ').trim() : null,
        };
      }
    } catch (err: unknown) {
      this.logger.warn(
        `[quote-expiry] recipient lookup failed for quote=${quote.id}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
    return { email: null, name: null };
  }

  private buildQuoteUrl(quote: Quote): string | null {
    if (!quote.shareToken) return null;
    const appUrl = (
      this.config.get<string>('APP_BASE_URL') ??
      this.config.get<string>('FRONTEND_URL') ??
      ''
    ).replace(/\/+$/, '');
    return `${appUrl}/quotes/${quote.shareToken}`;
  }

  private formatCaracas(date: Date): string {
    return date.toLocaleDateString('es-VE', {
      timeZone: 'America/Caracas',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }
}
