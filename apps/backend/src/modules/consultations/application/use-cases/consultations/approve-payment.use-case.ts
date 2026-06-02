import { Inject, Injectable } from '@nestjs/common';
import { Consultation } from '../../../domain/entities/consultation.entity';
import { ConsultationNotFoundError } from '../../../domain/errors/consultation-not-found.error';
import { ConsultationNotOwnedError } from '../../../domain/errors/consultation-not-owned.error';
import { PaymentAlreadyApprovedError } from '../../../domain/errors/payment-already-approved.error';
import {
  IConsultationRepository,
  CONSULTATION_REPOSITORY,
} from '../../../domain/repositories/consultation.repository';

export interface ApprovePaymentInput {
  consultationId: string;
  doctorId: string;
  amount: number;
  paymentMethod: string;
  paymentDate?: Date | null;
}

/**
 * Transitions a consultation payment from pending to approved.
 *
 * Guards:
 *   - Throws ConsultationNotFoundError if the consultation does not exist for this doctor.
 *   - Throws ConsultationNotOwnedError if the doctor is not the owner.
 *   - Throws PaymentAlreadyApprovedError if payment_status is already 'approved'.
 */
@Injectable()
export class ApprovePaymentUseCase {
  constructor(
    @Inject(CONSULTATION_REPOSITORY)
    private readonly repo: IConsultationRepository,
  ) {}

  async execute(input: ApprovePaymentInput): Promise<Consultation> {
    const consultation = await this.repo.findById(input.consultationId, input.doctorId);
    if (!consultation) {
      throw new ConsultationNotFoundError();
    }
    // findById is already scoped by doctorId so canBeModifiedBy() is redundant in the
    // normal code path. Kept as defense-in-depth — see update-consultation.use-case.ts.
    if (!consultation.canBeModifiedBy(input.doctorId)) {
      throw new ConsultationNotOwnedError();
    }
    if (!consultation.canApprovePayment()) {
      throw new PaymentAlreadyApprovedError();
    }

    return this.repo.updatePayment(input.consultationId, input.doctorId, {
      paymentStatus: 'approved',
      paymentMethod: input.paymentMethod,
      paymentDate: input.paymentDate ?? new Date(),
      amount: input.amount,
    });
  }
}
