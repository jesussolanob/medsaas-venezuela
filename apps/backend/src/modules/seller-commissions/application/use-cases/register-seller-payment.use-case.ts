import { Inject, Injectable } from '@nestjs/common';
import {
  SELLER_COMMISSION_REPOSITORY,
  type ISellerCommissionRepository,
} from '../../domain/repositories/seller-commission.repository';
import { CommissionSellerNotFoundError } from '../../domain/errors/commission-seller-not-found.error';
import { InvalidCommissionIdsError } from '../../domain/errors/invalid-commission-ids.error';
import type { SellerPayment } from '../../domain/entities/seller-payment.entity';

export interface RegisterSellerPaymentInput {
  sellerId: string;
  commissionIds: string[];
  method: string;
  reference: string;
  receiptUrl: string | null;
  notes: string | null;
}

/**
 * RegisterSellerPaymentUseCase
 *
 * Admin-only. Registers a cash-out for a set of pending commissions for a
 * specific seller.
 *
 * Steps:
 *   1. Validate seller exists.
 *   2. Validate all commission IDs belong to that seller and are pending
 *      (throws InvalidCommissionIdsError on any violation — anti-IDOR + anti-double-payment).
 *   3. Create the seller_payment row and mark commissions as 'paid' — transactional.
 *      The total is summed from the validated commission rows inside that same
 *      transaction (NEVER from client input, and never at this layer — see below).
 *
 * SECURITY:
 *   - adminId comes from the authenticated session (anti-IDOR). Never from body.
 *   - The payment amount is derived from the commissions, not from the request body.
 */
@Injectable()
export class RegisterSellerPaymentUseCase {
  constructor(
    @Inject(SELLER_COMMISSION_REPOSITORY)
    private readonly repo: ISellerCommissionRepository,
  ) {}

  async execute(input: RegisterSellerPaymentInput, adminId: string): Promise<SellerPayment> {
    // 1. Seller must exist and be active
    const seller = await this.repo.findSellerById(input.sellerId);
    if (!seller) {
      throw new CommissionSellerNotFoundError();
    }

    // 2. Validate all commission IDs: belong to seller + are pending
    const commissions = await this.repo.findCommissionsForPayment(
      input.sellerId,
      input.commissionIds,
    );

    // findCommissionsForPayment throws InvalidCommissionIdsError internally,
    // but we double-check here: if the returned count doesn't match the input,
    // something slipped through.
    if (commissions.length !== input.commissionIds.length) {
      throw new InvalidCommissionIdsError();
    }

    // 3. Register payment (transactional: creates payment + marks commissions paid).
    // The amount is NOT computed here on purpose: registerPayment re-queries the
    // commission rows inside the transaction with a row lock and sums them there.
    // Summing at this layer would be a TOCTOU window — another request could pay
    // the same commissions between this validation and the write.
    return this.repo.registerPayment(
      {
        sellerId: input.sellerId,
        commissionIds: input.commissionIds,
        method: input.method,
        reference: input.reference,
        receiptUrl: input.receiptUrl,
        notes: input.notes,
        paidAt: new Date(),
      },
      adminId,
    );
  }
}
