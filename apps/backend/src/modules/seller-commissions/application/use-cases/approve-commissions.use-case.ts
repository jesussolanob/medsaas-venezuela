import { Inject, Injectable } from '@nestjs/common';
import {
  SELLER_COMMISSION_REPOSITORY,
  type ISellerCommissionRepository,
} from '../../domain/repositories/seller-commission.repository';
import { CommissionSellerNotFoundError } from '../../domain/errors/commission-seller-not-found.error';

export interface ApproveCommissionsInput {
  sellerId: string;
  commissionIds: string[];
}

/**
 * ApproveCommissionsUseCase
 *
 * Admin-only. Moves commissions from 'pending' to 'approved': the admin reviewed
 * them and enabled them for payment. Nothing is paid here and no money moves —
 * this only unlocks RegisterSellerPaymentUseCase, which refuses anything that is
 * not 'approved'.
 *
 * Steps:
 *   1. Validate the seller exists.
 *   2. Approve the ids — the repository filters by seller and by status = 'pending'
 *      inside the UPDATE itself, so a double click can't approve twice and an id
 *      from another seller can't slip through (anti-IDOR).
 *
 * SECURITY:
 *   - adminId comes from the authenticated session. Never from the body.
 *   - Commission amounts must never appear in logs (financial data).
 */
@Injectable()
export class ApproveCommissionsUseCase {
  constructor(
    @Inject(SELLER_COMMISSION_REPOSITORY)
    private readonly repo: ISellerCommissionRepository,
  ) {}

  async execute(input: ApproveCommissionsInput, adminId: string): Promise<{ approved: number }> {
    const seller = await this.repo.findSellerById(input.sellerId);
    if (!seller) {
      throw new CommissionSellerNotFoundError();
    }

    const approved = await this.repo.approveCommissions(
      input.sellerId,
      input.commissionIds,
      adminId,
    );

    return { approved };
  }
}
