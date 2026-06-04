import { Inject, Injectable } from '@nestjs/common';
import {
  PAYMENT_REPOSITORY,
  type IPaymentRepository,
  type PaymentTotals,
} from '../../../domain/repositories/payment.repository';

export interface GetPaymentTotalsInput {
  doctorId: string;
  fromDate?: string;
  toDate?: string;
}

/**
 * Returns aggregate totals (approved/pending) for the authenticated doctor.
 * Used by dashboard KPI widgets and the cobros summary panel.
 *
 * SECURITY: doctorId comes from the authenticated user (anti-IDOR).
 */
@Injectable()
export class GetPaymentTotalsUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepo: IPaymentRepository,
  ) {}

  async execute(input: GetPaymentTotalsInput): Promise<PaymentTotals> {
    return this.paymentRepo.totalsForDoctor({
      doctorId: input.doctorId,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
  }
}
