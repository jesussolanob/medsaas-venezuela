import { Inject, Injectable } from '@nestjs/common';
import {
  PAYMENT_REPOSITORY,
  type IPaymentRepository,
} from '../../../domain/repositories/payment.repository';
import type { PaymentItem } from '../../../domain/entities/payment-item.entity';

export interface ListPaymentItemsInput {
  paymentId: string;
  doctorId: string;
}

/**
 * Lists all line items attached to a payment.
 * Verifies that the payment belongs to the authenticated doctor.
 *
 * SECURITY: doctorId comes from the authenticated user (anti-IDOR).
 */
@Injectable()
export class ListPaymentItemsUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepo: IPaymentRepository,
  ) {}

  async execute(input: ListPaymentItemsInput): Promise<PaymentItem[]> {
    return this.paymentRepo.listItems(input.paymentId, input.doctorId);
  }
}
