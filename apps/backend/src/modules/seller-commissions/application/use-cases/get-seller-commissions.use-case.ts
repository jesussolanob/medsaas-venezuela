import { Inject, Injectable } from '@nestjs/common';
import {
  SELLER_COMMISSION_REPOSITORY,
  type ISellerCommissionRepository,
  type CommissionRow,
} from '../../domain/repositories/seller-commission.repository';

/**
 * GetSellerCommissionsUseCase
 *
 * Returns all commissions for the authenticated seller (paid and pending).
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
  ) {}

  async execute(sellerId: string): Promise<CommissionRow[]> {
    return this.repo.listCommissionsBySeller(sellerId);
  }
}
