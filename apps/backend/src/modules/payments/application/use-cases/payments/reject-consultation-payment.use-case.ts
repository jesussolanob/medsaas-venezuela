import { Inject, Injectable } from '@nestjs/common';
import type { ConsultationPayment } from '../../../domain/entities/consultation-payment.entity';
import { ConsultationPaymentNotFoundError } from '../../../domain/errors/consultation-payment-not-found.error';
import { ConsultationPaymentNotOwnedError } from '../../../domain/errors/consultation-payment-not-owned.error';
import {
  IConsultationPaymentRepository,
  CONSULTATION_PAYMENT_REPOSITORY,
} from '../../../domain/repositories/consultation-payment.repository';

export interface RejectConsultationPaymentInput {
  paymentId: string;
  doctorId: string;
  notes?: string | null;
}

/**
 * Transitions a consultation payment from pending → rejected.
 *
 * Guards:
 *   - Throws ConsultationPaymentNotFoundError when the payment does not exist.
 *   - Throws ConsultationPaymentNotOwnedError when the doctor does not own the payment.
 *   - Throws PaymentAlreadyResolvedError (from entity) when already approved or rejected.
 */
@Injectable()
export class RejectConsultationPaymentUseCase {
  constructor(
    @Inject(CONSULTATION_PAYMENT_REPOSITORY)
    private readonly repo: IConsultationPaymentRepository,
  ) {}

  async execute(input: RejectConsultationPaymentInput): Promise<ConsultationPayment> {
    const payment = await this.repo.findByIdForDoctor(input.paymentId, input.doctorId);
    if (!payment) {
      throw new ConsultationPaymentNotFoundError();
    }

    // findByIdForDoctor scopes by doctorId; this is defense-in-depth.
    if (!payment.isOwnedBy(input.doctorId)) {
      throw new ConsultationPaymentNotOwnedError();
    }

    // Domain entity enforces the transition invariant — throws PaymentAlreadyResolvedError
    // if the payment is not pending.
    const rejected = payment.reject();

    return this.repo.save(rejected);
  }
}
