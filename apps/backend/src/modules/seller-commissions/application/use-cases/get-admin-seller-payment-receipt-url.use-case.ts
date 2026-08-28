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

export interface GetAdminSellerPaymentReceiptUrlOutput {
  url: string;
}

/**
 * Returns a short-lived signed URL for a seller payment comprobante.
 *
 * Admin-only endpoint (@Roles('super_admin')).  No ownership check is needed
 * because the admin can access any seller's payment.
 *
 * SECURITY:
 *   - Returns 404 when the payment does not exist or has no comprobante.
 *   - The raw GCS path (receiptUrl) is NEVER returned — only the signed URL.
 *   - The GCS path must never appear in logs.
 */
@Injectable()
export class GetAdminSellerPaymentReceiptUrlUseCase {
  constructor(
    @Inject(SELLER_COMMISSION_REPOSITORY)
    private readonly repo: ISellerCommissionRepository,
    @Inject(STORAGE_PORT)
    private readonly storage: IStoragePort,
  ) {}

  async execute(paymentId: string): Promise<GetAdminSellerPaymentReceiptUrlOutput> {
    const payment = await this.repo.findPaymentById(paymentId);

    if (!payment) {
      throw new SellerPaymentNotFoundError();
    }

    if (!payment.receiptUrl) {
      throw new SellerPaymentReceiptMissingError();
    }

    const url = await this.storage.getSignedUrl(payment.receiptUrl, RECEIPT_URL_TTL_MS);

    return { url };
  }
}
