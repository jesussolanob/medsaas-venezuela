import { Inject, Injectable } from '@nestjs/common';
import {
  PAYMENT_REPOSITORY,
  type IPaymentRepository,
} from '../../../domain/repositories/payment.repository';

export interface RemovePaymentItemInput {
  itemId: string;
  doctorId: string;
}

/**
 * Removes a line item from a payment and recalculates the total.
 * Also syncs appointments.plan_price.
 *
 * SECURITY: doctorId comes from the authenticated user (anti-IDOR).
 * The repository verifies that the item's parent payment belongs to doctorId.
 */
@Injectable()
export class RemovePaymentItemUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepo: IPaymentRepository,
  ) {}

  async execute(input: RemovePaymentItemInput): Promise<void> {
    await this.paymentRepo.removeItem(input.itemId, input.doctorId);
  }
}
