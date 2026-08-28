import { Inject, Injectable } from '@nestjs/common';
import {
  SELLER_COMMISSION_REPOSITORY,
  type ISellerCommissionRepository,
} from '../../domain/repositories/seller-commission.repository';
import { SellerPaymentNotFoundError } from '../../domain/errors/seller-payment-not-found.error';
import { SellerPaymentReceiptMissingError } from '../../domain/errors/seller-payment-receipt-missing.error';
import { STORAGE_PORT, type IStoragePort } from '../../../storage/application/ports/storage.port';

// Signed URL TTL: 15 minutes — consistent with subscription-payments pattern.
const RECEIPT_URL_TTL_MS = 15 * 60 * 1000;

export interface GetSellerPaymentReceiptUrlOutput {
  url: string;
}

/**
 * Returns a short-lived signed URL for a seller payment comprobante.
 *
 * Seller-facing endpoint (@Roles('seller')).
 *
 * SECURITY:
 *   - sellerId MUST come from the authenticated session (CurrentUser().sub), never
 *     from the request body or URL parameter.
 *   - If the payment does not exist OR belongs to a different seller, the same
 *     SellerPaymentNotFoundError is thrown.  This prevents a seller from enumerating
 *     another seller's payments by observing different error codes (anti-IDOR).
 *   - The raw GCS path (receiptUrl) is NEVER returned — only the signed URL.
 *   - The GCS path must never appear in logs.
 */
@Injectable()
export class GetSellerPaymentReceiptUrlUseCase {
  constructor(
    @Inject(SELLER_COMMISSION_REPOSITORY)
    private readonly repo: ISellerCommissionRepository,
    @Inject(STORAGE_PORT)
    private readonly storage: IStoragePort,
  ) {}

  async execute(paymentId: string, sellerId: string): Promise<GetSellerPaymentReceiptUrlOutput> {
    const payment = await this.repo.findPaymentById(paymentId);

    // Anti-IDOR: treat "not found" and "not owned" identically.
    if (!payment || payment.sellerId !== sellerId) {
      throw new SellerPaymentNotFoundError();
    }

    if (!payment.receiptUrl) {
      throw new SellerPaymentReceiptMissingError();
    }

    const url = await this.storage.getSignedUrl(payment.receiptUrl, RECEIPT_URL_TTL_MS);

    return { url };
  }
}
