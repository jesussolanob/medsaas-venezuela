import { Inject, Injectable } from '@nestjs/common';
import {
  PAYMENT_REPOSITORY,
  type IPaymentRepository,
} from '../../../domain/repositories/payment.repository';
import type { Payment } from '../../../domain/entities/payment.entity';

export interface AttachPaymentReceiptInput {
  paymentId: string;
  doctorId: string;
  receiptUrl: string;
}

/**
 * Attaches a payment receipt URL to an existing payment record.
 *
 * SECURITY:
 *   - doctorId is taken from the authenticated user — anti-IDOR.
 *   - Throws PaymentNotFoundError (404) when paymentId does not exist.
 *   - Throws PaymentNotOwnedError (403) when the payment belongs to another doctor.
 */
@Injectable()
export class AttachPaymentReceiptUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepo: IPaymentRepository,
  ) {}

  async execute(input: AttachPaymentReceiptInput): Promise<Payment> {
    return this.paymentRepo.attachReceiptUrl(
      input.paymentId,
      input.doctorId,
      input.receiptUrl,
    );
  }
}
