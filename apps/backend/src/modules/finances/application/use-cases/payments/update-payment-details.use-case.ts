import { Inject, Injectable } from '@nestjs/common';
import {
  PAYMENT_REPOSITORY,
  type IPaymentRepository,
} from '../../../domain/repositories/payment.repository';
import type { Payment } from '../../../domain/entities/payment.entity';

export interface UpdatePaymentDetailsInput {
  paymentId: string;
  doctorId: string;
  paidAt?: Date | null;
  methodSnapshot?: string | null;
  paymentReference?: string | null;
  bcvRate?: number | null;
  amountBs?: number | null;
}

/**
 * Partially updates financial detail fields on a payment (Cobros drawer).
 *
 * Fields:
 *   paidAt         — date when the payment was received.
 *   methodSnapshot — payment method label.
 *   paymentReference — bank reference / transfer ID.
 *   bcvRate        — USD/VES exchange rate at payment time.
 *   amountBs       — equivalent amount in bolivares.
 *
 * SECURITY: doctorId is always from the authenticated caller (anti-IDOR).
 * The repository guarantees 404 (PaymentNotFoundError) before 403 (PaymentNotOwnedError).
 * No pre-check here — the repo handles both in a single locked query (avoids TOCTOU).
 */
@Injectable()
export class UpdatePaymentDetailsUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepo: IPaymentRepository,
  ) {}

  async execute(input: UpdatePaymentDetailsInput): Promise<Payment> {
    return this.paymentRepo.updateDetails(input.paymentId, input.doctorId, {
      paidAt: input.paidAt,
      methodSnapshot: input.methodSnapshot,
      paymentReference: input.paymentReference,
      bcvRate: input.bcvRate,
      amountBs: input.amountBs,
    });
  }
}
