import { Inject, Injectable } from '@nestjs/common';
import {
  SELLER_REPOSITORY,
  type ISellerRepository,
  type SellerPaymentDetails,
} from '../../domain/repositories/seller.repository';
import { InvalidPaymentEntryError } from '../../domain/errors/invalid-payment-entry.error';

/**
 * UpdateSellerPaymentDetailsUseCase
 *
 * Lets a seller configure how Delta pays their commissions
 * (bank transfer, pago móvil, etc.).
 *
 * The JSONB shape mirrors the specialist payment_details used in
 * doctor-settings (see ADR-044). Shape: { [method]: PaymentEntry | PaymentEntry[] }
 * where PaymentEntry = Record<string, string>.
 *
 * Validation rules:
 *   - Every value within a PaymentEntry must be a string.
 *   - No PaymentEntry may be completely empty (zero keys).
 *
 * SECURITY:
 *   - sellerId MUST come from the authenticated session (CurrentUser().sub).
 *     Never from the request body or URL parameter.
 *   - details contain financial data — callers must not log them.
 *   - Error messages NEVER echo actual field values.
 */
@Injectable()
export class UpdateSellerPaymentDetailsUseCase {
  constructor(
    @Inject(SELLER_REPOSITORY)
    private readonly sellerRepo: ISellerRepository,
  ) {}

  async execute(sellerId: string, details: Record<string, unknown>): Promise<SellerPaymentDetails> {
    this.validateEntries(details);
    return this.sellerRepo.updateSellerPaymentDetails(sellerId, details);
  }

  /**
   * Validates every method entry in the payment details map.
   * Accepts both single-entry (object) and multi-entry (array) shapes.
   */
  private validateEntries(details: Record<string, unknown>): void {
    for (const [method, value] of Object.entries(details)) {
      if (Array.isArray(value)) {
        for (const entry of value) {
          this.validateSingleEntry(method, entry);
        }
      } else {
        this.validateSingleEntry(method, value);
      }
    }
  }

  /**
   * A single PaymentEntry must be a non-empty object whose every value is a string.
   * This catches:
   *   - null / non-object values
   *   - nested arrays (invalid shape)
   *   - completely empty objects {}
   *   - objects with number, boolean, or object values instead of strings
   */
  private validateSingleEntry(method: string, entry: unknown): void {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new InvalidPaymentEntryError(method);
    }

    const rec = entry as Record<string, unknown>;

    if (Object.keys(rec).length === 0) {
      throw new InvalidPaymentEntryError(method);
    }

    for (const v of Object.values(rec)) {
      if (typeof v !== 'string') {
        throw new InvalidPaymentEntryError(method);
      }
    }
  }
}
