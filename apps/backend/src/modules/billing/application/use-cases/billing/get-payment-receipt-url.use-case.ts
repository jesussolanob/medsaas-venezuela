import { Inject, Injectable } from '@nestjs/common';
import {
  SUBSCRIPTION_PAYMENT_REPOSITORY,
  type ISubscriptionPaymentRepository,
} from '../../../domain/repositories/subscription-payment.repository';
import { SubscriptionPaymentNotFoundError } from '../../../domain/errors/subscription-payment-not-found.error';
import {
  STORAGE_PORT,
  type IStoragePort,
} from '../../../../storage/application/ports/storage.port';

// Signed URL TTL: 15 minutes (short-lived for sensitive financial documents).
const RECEIPT_URL_TTL_MS = 15 * 60 * 1000;

export interface GetPaymentReceiptUrlOutput {
  signedUrl: string;
}

/**
 * Returns a short-lived signed URL for a payment comprobante.
 *
 * Admin-only (super_admin). Never exposes the raw GCS path to clients.
 *
 * SECURITY:
 *   - Returns 404 when the payment does not exist OR has no comprobante.
 *   - The signed URL expires in 15 minutes.
 *   - The raw GCS path (receiptUrl) is NEVER returned — only the signed URL.
 */
@Injectable()
export class GetPaymentReceiptUrlUseCase {
  constructor(
    @Inject(SUBSCRIPTION_PAYMENT_REPOSITORY)
    private readonly repo: ISubscriptionPaymentRepository,
    @Inject(STORAGE_PORT)
    private readonly storage: IStoragePort,
  ) {}

  async execute(paymentId: string): Promise<GetPaymentReceiptUrlOutput> {
    const payment = await this.repo.findById(paymentId);

    if (!payment || !payment.receiptUrl) {
      throw new SubscriptionPaymentNotFoundError(paymentId);
    }

    const signedUrl = await this.storage.getSignedUrl(payment.receiptUrl, RECEIPT_URL_TTL_MS);

    return { signedUrl };
  }
}
