import { Inject, Injectable } from '@nestjs/common';
import {
  SELLER_COMMISSION_REPOSITORY,
  type ISellerCommissionRepository,
} from '../../domain/repositories/seller-commission.repository';

export interface SellerPendingSummary {
  /**
   * Total USD amount of commissions with status='pending'.
   * Zero when there are no outstanding rows.
   *
   * SECURITY: financial data — never log this value.
   */
  pendingCommissionsUsd: number;
  /**
   * Number of individual commission rows with status='pending'.
   * Zero when there are no outstanding rows.
   */
  pendingCommissionsCount: number;
}

/**
 * GetSellerPendingSummaryUseCase
 *
 * Returns the total pending commission amount and count for a single seller.
 * Used by DeactivateSellerAccountUseCase (SellersModule) to inform the seller
 * of outstanding earnings before they confirm deactivation.
 *
 * Computes the totals from `listCommissionsBySeller` so the filtering logic
 * lives in one place: here, inside the module that owns commissions. If the
 * definition of "pending" ever changes (e.g. a new status, a cancelled row)
 * only this use case needs updating — not the deactivation path.
 *
 * SECURITY:
 *   - sellerId always comes from the authenticated session (anti-IDOR).
 *   - Individual commission rows are never forwarded; only the aggregate is.
 */
@Injectable()
export class GetSellerPendingSummaryUseCase {
  constructor(
    @Inject(SELLER_COMMISSION_REPOSITORY)
    private readonly repo: ISellerCommissionRepository,
  ) {}

  async execute(sellerId: string): Promise<SellerPendingSummary> {
    const rows = await this.repo.listCommissionsBySeller(sellerId);
    const pending = rows.filter((r) => r.status === 'pending');
    const pendingCommissionsUsd = pending.reduce((sum, r) => sum + r.amountUsd, 0);
    return {
      pendingCommissionsUsd,
      pendingCommissionsCount: pending.length,
    };
  }
}
