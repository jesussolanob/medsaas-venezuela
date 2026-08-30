import { Inject, Injectable } from '@nestjs/common';
import {
  SELLER_COMMISSION_REPOSITORY,
  type ISellerCommissionRepository,
  type PendingBySeller,
} from '../../domain/repositories/seller-commission.repository';
import {
  USDT_RATE_STORE,
  type IUsdtRateStore,
} from '../../../finances/domain/repositories/usdt-rate.store';

/**
 * Result shape for GetPendingCommissionsBySellerUseCase.
 *
 * The current BCV rate is included so the admin can see the bolivar equivalent
 * of each pending total without a separate request.
 *
 * bcvRate is null when the rate is unavailable — the frontend must show only
 * the USD amounts and an explanatory notice in that case.
 */
export interface PendingCommissionsResult {
  /** Current BCV rate (Bs per USD). Null when unavailable. Never log. */
  bcvRate: number | null;
  sellers: PendingBySeller[];
}

/**
 * GetPendingCommissionsBySellerUseCase
 *
 * Admin-only. Returns all pending commissions grouped by seller,
 * with the total pending amount, the detail of each commission, and the
 * current BCV rate for client-side bolivar conversion.
 *
 * SECURITY: Caller must have role='super_admin'. The controller enforces this
 * with @Roles('super_admin') + RolesGuard. sellerName and specialistName are PII.
 */
@Injectable()
export class GetPendingCommissionsBySellerUseCase {
  constructor(
    @Inject(SELLER_COMMISSION_REPOSITORY)
    private readonly repo: ISellerCommissionRepository,
    @Inject(USDT_RATE_STORE)
    private readonly rateStore: IUsdtRateStore,
  ) {}

  async execute(): Promise<PendingCommissionsResult> {
    const [sellers, summary] = await Promise.all([
      this.repo.listPendingBySeller(),
      this.rateStore.getRatesSummary().catch(() => null),
    ]);
    return {
      bcvRate: summary?.bcv ?? null,
      sellers,
    };
  }
}
