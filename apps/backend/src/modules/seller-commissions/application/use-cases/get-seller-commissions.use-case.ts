import { Inject, Injectable } from '@nestjs/common';
import {
  SELLER_COMMISSION_REPOSITORY,
  type ISellerCommissionRepository,
  type CommissionRow,
} from '../../domain/repositories/seller-commission.repository';
import {
  USDT_RATE_STORE,
  type IUsdtRateStore,
} from '../../../finances/domain/repositories/usdt-rate.store';

/**
 * Result shape for GetSellerCommissionsUseCase.
 *
 * The current BCV rate is included so the frontend can display the bolivar
 * equivalent of pending commissions without a second request.
 *
 * bcvRate is null when the rate is unavailable — the frontend must show only
 * the USD amounts and an explanatory notice in that case.
 */
export interface SellerCommissionsResult {
  /** Current BCV rate (Bs per USD). Null when unavailable. Never log. */
  bcvRate: number | null;
  commissions: CommissionRow[];
}

/**
 * GetSellerCommissionsUseCase
 *
 * Returns all commissions for the authenticated seller (paid and pending),
 * together with the current BCV rate for client-side bolivar conversion.
 *
 * SECURITY:
 *   - sellerId always comes from the authenticated session (anti-IDOR).
 *   - specialistName is PII — only exposed to the owning seller.
 */
@Injectable()
export class GetSellerCommissionsUseCase {
  constructor(
    @Inject(SELLER_COMMISSION_REPOSITORY)
    private readonly repo: ISellerCommissionRepository,
    @Inject(USDT_RATE_STORE)
    private readonly rateStore: IUsdtRateStore,
  ) {}

  async execute(sellerId: string): Promise<SellerCommissionsResult> {
    const [commissions, summary] = await Promise.all([
      this.repo.listCommissionsBySeller(sellerId),
      this.rateStore.getRatesSummary().catch(() => null),
    ]);
    return {
      bcvRate: summary?.bcv ?? null,
      commissions,
    };
  }
}
