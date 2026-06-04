import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  PAYMENT_REPOSITORY,
  type IPaymentRepository,
} from '../../../domain/repositories/payment.repository';
import type { PaymentItem } from '../../../domain/entities/payment-item.entity';
import { PaymentNotFoundError } from '../../../domain/errors/payment-not-found.error';

export interface AddPaymentItemInput {
  paymentId: string;
  doctorId: string;
  name: string;
  amountUsd: number;
  sourceType?: string | null;
  sourceId?: string | null;
}

/**
 * Adds a line item to an existing payment and recalculates the total.
 * Also syncs appointments.plan_price.
 *
 * SECURITY: doctorId comes from the authenticated user (anti-IDOR).
 */
@Injectable()
export class AddPaymentItemUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepo: IPaymentRepository,
  ) {}

  async execute(input: AddPaymentItemInput): Promise<PaymentItem> {
    // Verify existence first so callers get a clear NOT_FOUND before FORBIDDEN.
    const existing = await this.paymentRepo.findByIdForDoctor(input.paymentId, input.doctorId);
    if (!existing) throw new PaymentNotFoundError(input.paymentId);

    return this.paymentRepo.addItem({
      id: randomUUID(),
      paymentId: input.paymentId,
      doctorId: input.doctorId,
      name: input.name,
      amountUsd: input.amountUsd,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
    });
  }
}
