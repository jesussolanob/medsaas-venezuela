import { Inject, Injectable } from '@nestjs/common';
import {
  PAYMENT_REPOSITORY,
  type IPaymentRepository,
  type PaymentWithRelations,
  type PaymentListFilters,
} from '../../../domain/repositories/payment.repository';

export interface ListPaymentsInput {
  doctorId: string;
  status?: 'pending' | 'approved' | 'all';
  fromDate?: string;
  toDate?: string;
}

/**
 * Lists payments for the authenticated doctor with their appointment and
 * consultation joins. The result shape is compatible with lib/finances.ts
 * PaymentRow used by the frontend cobros page.
 *
 * SECURITY: doctorId comes from the authenticated user (anti-IDOR).
 */
@Injectable()
export class ListPaymentsUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepo: IPaymentRepository,
  ) {}

  async execute(input: ListPaymentsInput): Promise<PaymentWithRelations[]> {
    const filters: PaymentListFilters = {
      doctorId: input.doctorId,
      status: input.status,
      fromDate: input.fromDate,
      toDate: input.toDate,
    };
    return this.paymentRepo.listForDoctor(filters);
  }
}
