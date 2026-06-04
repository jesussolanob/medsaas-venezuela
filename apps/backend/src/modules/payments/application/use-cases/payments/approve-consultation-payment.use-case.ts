import { Inject, Injectable } from '@nestjs/common';
import type { ConsultationPayment } from '../../../domain/entities/consultation-payment.entity';
import { ConsultationPaymentNotFoundError } from '../../../domain/errors/consultation-payment-not-found.error';
import { ConsultationPaymentNotOwnedError } from '../../../domain/errors/consultation-payment-not-owned.error';
import {
  IConsultationPaymentRepository,
  CONSULTATION_PAYMENT_REPOSITORY,
} from '../../../domain/repositories/consultation-payment.repository';

export interface ApproveConsultationPaymentInput {
  paymentId: string;
  doctorId: string;
}

/**
 * Transitions a consultation payment from pending → approved.
 *
 * Guards:
 *   - Throws ConsultationPaymentNotFoundError when the payment does not exist.
 *   - Throws ConsultationPaymentNotOwnedError when the doctor does not own the payment.
 *   - Throws PaymentAlreadyResolvedError (from entity) when already approved or rejected.
 *
 * The entity.approve() call enforces the status invariant; this use case only
 * handles the lookup, ownership check, and persistence.
 */
@Injectable()
export class ApproveConsultationPaymentUseCase {
  constructor(
    @Inject(CONSULTATION_PAYMENT_REPOSITORY)
    private readonly repo: IConsultationPaymentRepository,
  ) {}

  async execute(input: ApproveConsultationPaymentInput): Promise<ConsultationPayment> {
    const payment = await this.repo.findByIdForDoctor(input.paymentId, input.doctorId);
    if (!payment) {
      throw new ConsultationPaymentNotFoundError();
    }

    // findByIdForDoctor already scopes by doctorId; this is defense-in-depth.
    if (!payment.isOwnedBy(input.doctorId)) {
      throw new ConsultationPaymentNotOwnedError();
    }

    // Domain entity enforces the transition invariant — throws PaymentAlreadyResolvedError
    // if the payment is not pending.
    const approved = payment.approve(input.doctorId);

    return this.repo.save(approved);
  }
}
