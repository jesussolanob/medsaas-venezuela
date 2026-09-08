import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PublicQuoteStatusDto } from '@delta/shared-types';
import {
  QUOTE_REPOSITORY,
  type IQuoteRepository,
} from '../../domain/repositories/iquote.repository';
import type { Quote } from '../../domain/entities/quote.entity';
import { QuoteLinkExpiredError } from '../../domain/errors/quote-link-expired.error';
import { QuoteInvalidStatusTransitionError } from '../../domain/errors/quote-invalid-status-transition.error';
import { MailerService } from '../../../email/application/services/mailer.service';
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

/**
 * UpdatePublicQuoteStatusUseCase — lets the (unauthenticated) recipient of a
 * quote accept or reject it from the public share-link view.
 *
 * Contract:
 *   - Resolves the quote via the share-link token — same anti-enumeration
 *     404 (QuoteLinkExpiredError) as GetPublicQuoteUseCase for a missing,
 *     expired, or revoked token.
 *   - Only 'sent' → 'accepted' | 'rejected' is allowed (Quote.canTransitionTo).
 *     A quote that is already accepted/rejected/expired, or still a draft,
 *     produces QuoteInvalidStatusTransitionError (422).
 *   - doctorId for the write is ALWAYS taken from the token-resolved quote,
 *     never from the request — the caller has no way to influence it
 *     (anti-IDOR: this is a public endpoint with no doctorId in the payload).
 *   - 🔴 Does NOT create an appointment. The recipient is only shown the
 *     specialist's public booking link (/book/:doctorId) — creating a booking
 *     from an unauthenticated endpoint would let anyone holding the link
 *     occupy the agenda (owner decision, 2026-09-08).
 *   - On acceptance, best-effort notifies the specialist by email. A failure
 *     to notify must never break the status transition — the quote is
 *     already persisted as accepted by the time the email is attempted.
 */
@Injectable()
export class UpdatePublicQuoteStatusUseCase {
  private readonly logger = new Logger(UpdatePublicQuoteStatusUseCase.name);

  constructor(
    @Inject(QUOTE_REPOSITORY)
    private readonly quoteRepo: IQuoteRepository,
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly doctorProfileRepo: IDoctorProfileRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
    @Inject(LEAD_REPOSITORY)
    private readonly leadRepo: ILeadRepository,
    private readonly mailer: MailerService,
  ) {}

  async execute(token: string, dto: PublicQuoteStatusDto): Promise<Quote> {
    const quote = await this.quoteRepo.findQuoteByValidToken(token);
    if (!quote) {
      // Missing, expired, or revoked token — same 404 as the GET (anti-enumeration).
      throw new QuoteLinkExpiredError();
    }

    if (!quote.canTransitionTo(dto.status)) {
      throw new QuoteInvalidStatusTransitionError(quote.status, dto.status);
    }

    // doctorId comes from the resolved quote, never from the request body/params.
    // Se pasa el estado que se leyó: si otra respuesta llegó primero, el UPDATE
    // afecta 0 filas y el repositorio lanza la transición inválida en vez de pisar.
    const updated = await this.quoteRepo.updateStatus(
      quote.id,
      quote.doctorId,
      dto.status,
      quote.status,
    );

    if (dto.status === 'accepted') {
      await this.notifyDoctorSafely(updated);
    }

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Best-effort notice to the specialist that their quote was accepted.
   * Never throws — a delivery failure must not surface to the recipient,
   * who already got a successful response for their own action.
   */
  private async notifyDoctorSafely(quote: Quote): Promise<void> {
    try {
      const [doctorProfile, recipientName] = await Promise.all([
        this.doctorProfileRepo.findByDoctorId(quote.doctorId),
        this.resolveRecipientName(quote),
      ]);

      if (!doctorProfile?.email) {
        this.logger.log(
          `[public-quote] doctor ${quote.doctorId} has no email on file — skipping accepted notice`,
        );
        return;
      }

      await this.mailer.sendTemplate(
        'quote_accepted_doctor',
        doctorProfile.email,
        {
          doctorName: doctorProfile.fullName,
          quoteNumber: quote.quoteNumber,
          recipientName: recipientName ?? 'El destinatario',
          totalUsd: quote.totalUsd.toFixed(2),
        },
        { type: 'doctor', id: quote.doctorId },
      );
    } catch (err: unknown) {
      // Log by quote id only — never the recipient's name or email (PII).
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[public-quote] accepted notice failed for quote ${quote.id}: ${msg}`);
    }
  }

  /**
   * Same resolution pattern as GetQuoteUseCase / GetPublicQuoteUseCase:
   * decrypted patient name, or lead name. Best-effort — a missing name must
   * not prevent the doctor notice from going out.
   */
  private async resolveRecipientName(quote: Quote): Promise<string | null> {
    try {
      if (quote.patientId !== null) {
        const patient = await this.patientRepo.findById(quote.patientId, quote.doctorId);
        return patient?.fullName?.trim() || null;
      }
      if (quote.leadId !== null) {
        const lead = await this.leadRepo.findByIdForDoctor(quote.leadId, quote.doctorId);
        if (!lead) return null;
        return [lead.name, lead.lastName].filter(Boolean).join(' ').trim() || null;
      }
    } catch {
      // Sin log: el error podría arrastrar el nombre, que es PII.
      return null;
    }
    return null;
  }
}
