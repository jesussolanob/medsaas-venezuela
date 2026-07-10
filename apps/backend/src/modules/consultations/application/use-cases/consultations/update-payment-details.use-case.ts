import { Inject, Injectable } from '@nestjs/common';
import type { PaymentStatus } from '@delta/shared-types';
import { Consultation } from '../../../domain/entities/consultation.entity';
import { ConsultationNotFoundError } from '../../../domain/errors/consultation-not-found.error';
import { ConsultationNotOwnedError } from '../../../domain/errors/consultation-not-owned.error';
import {
  IConsultationRepository,
  CONSULTATION_REPOSITORY,
} from '../../../domain/repositories/consultation.repository';

/**
 * Input for UpdatePaymentDetailsUseCase.
 *
 * Undefined semantics (consistent with the repository contract):
 *   - undefined → field not touched
 *   - null      → field cleared (written as NULL)
 *   - value     → field replaced
 *
 * All payment-detail fields (method, reference, receiptUrl, amount, status) are
 * optional; at least one meaningful field should be provided by the caller.
 *
 * Anti-IDOR: doctorId MUST come from the authenticated user (user.sub) — never
 * from the request body.
 */
export interface UpdatePaymentDetailsInput {
  consultationId: string;
  doctorId: string;
  paymentStatus?: PaymentStatus;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  paymentReceiptUrl?: string | null;
  amount?: number | null;
}

/**
 * Updates payment details on a consultation.
 *
 * Unlike ApprovePaymentUseCase (which enforces pending→approved only), this use
 * case allows editing payment details at any time — even when the payment is
 * already approved. This is by design: doctors need to attach/edit references and
 * receipts after the fact.
 *
 * Guards:
 *   - Throws ConsultationNotFoundError if the consultation does not exist for this doctor.
 *   - Throws ConsultationNotOwnedError if the doctor is not the owner (defense-in-depth).
 */
@Injectable()
export class UpdatePaymentDetailsUseCase {
  constructor(
    @Inject(CONSULTATION_REPOSITORY)
    private readonly repo: IConsultationRepository,
  ) {}

  async execute(input: UpdatePaymentDetailsInput): Promise<Consultation> {
    const consultation = await this.repo.findById(input.consultationId, input.doctorId);
    if (!consultation) {
      throw new ConsultationNotFoundError();
    }
    // findById is already scoped by doctorId; canBeModifiedBy() is defense-in-depth.
    if (!consultation.canBeModifiedBy(input.doctorId)) {
      throw new ConsultationNotOwnedError();
    }

    return this.repo.updatePaymentDetails(input.consultationId, input.doctorId, {
      paymentStatus: input.paymentStatus,
      paymentMethod: input.paymentMethod,
      paymentReference: input.paymentReference,
      paymentReceiptUrl: input.paymentReceiptUrl,
      amount: input.amount,
    });
  }
}
