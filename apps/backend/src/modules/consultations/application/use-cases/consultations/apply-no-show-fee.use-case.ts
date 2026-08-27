import { Inject, Injectable } from '@nestjs/common';
import { Consultation } from '../../../domain/entities/consultation.entity';
import { ConsultationNotFoundError } from '../../../domain/errors/consultation-not-found.error';
import { ConsultationNotOwnedError } from '../../../domain/errors/consultation-not-owned.error';
import {
  IConsultationRepository,
  CONSULTATION_REPOSITORY,
} from '../../../domain/repositories/consultation.repository';

export interface ApplyNoShowFeeInput {
  consultationId: string;
  /** Always taken from CurrentUserPayload.sub — never from the request body. */
  doctorId: string;
  /**
   * The new total amount after the no-show fee is included.
   * Computed by the caller as: originalAmount + noShowFee.
   */
  newAmount: number;
}

/**
 * ApplyNoShowFeeUseCase
 *
 * Handles the no-show penalty path:
 *   - Updates consultations.amount and consultations.payment_status = 'pending'.
 *   - If the consultation came from a booking and has a linked **approved** payment,
 *     also updates that payment: status → 'pending', amount_usd → newAmount.
 *
 * Both writes happen atomically inside a single DB transaction via the repository.
 * If either write fails, both are rolled back — the doctor never sees a consultation
 * updated but the payment un-synced.
 *
 * This use case is intentionally separate from UpdatePaymentDetailsUseCase.
 * The generic "edit payment fields" path must never touch the payments table as a
 * side effect. Payment sync is ONLY correct in this specific no-show scenario.
 *
 * SECURITY:
 *   - doctorId comes from CurrentUserPayload.sub (session token) — never the body.
 *   - Ownership is verified before any write: ConsultationNotFoundError /
 *     ConsultationNotOwnedError are thrown first.
 */
@Injectable()
export class ApplyNoShowFeeUseCase {
  constructor(
    @Inject(CONSULTATION_REPOSITORY)
    private readonly repo: IConsultationRepository,
  ) {}

  async execute(input: ApplyNoShowFeeInput): Promise<Consultation> {
    // Verify the consultation exists and belongs to this doctor before writing.
    const consultation = await this.repo.findById(input.consultationId, input.doctorId);
    if (!consultation) {
      throw new ConsultationNotFoundError();
    }
    if (!consultation.canBeModifiedBy(input.doctorId)) {
      throw new ConsultationNotOwnedError();
    }

    // Delegate the atomic double-write to the repository.
    return this.repo.applyNoShowFee(input.consultationId, input.doctorId, input.newAmount);
  }
}
