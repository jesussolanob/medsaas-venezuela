import { Inject, Injectable } from '@nestjs/common';
import {
  PAYMENT_REPOSITORY,
  type IPaymentRepository,
} from '../../../domain/repositories/payment.repository';
import type { Payment, PaymentStatus } from '../../../domain/entities/payment.entity';
import { PaymentNotFoundError } from '../../../domain/errors/payment-not-found.error';

export interface UpdatePaymentStatusInput {
  paymentId: string;
  doctorId: string;
  status: PaymentStatus;
}

/**
 * Updates the status of a payment ('pending' → 'approved' or vice versa).
 * Internally syncs consultations.payment_status via the appointment link.
 *
 * SECURITY: doctorId comes from the authenticated user (anti-IDOR).
 * The repository throws PaymentNotOwnedError if the payment belongs to
 * a different doctor.
 */
@Injectable()
export class UpdatePaymentStatusUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepo: IPaymentRepository,
  ) {}

  async execute(input: UpdatePaymentStatusInput): Promise<Payment> {
    // Verify existence first so callers get a clear NOT_FOUND before FORBIDDEN.
    const existing = await this.paymentRepo.findByIdForDoctor(input.paymentId, input.doctorId);
    if (!existing) throw new PaymentNotFoundError(input.paymentId);

    return this.paymentRepo.updateStatus(input.paymentId, input.doctorId, input.status);
  }
}
