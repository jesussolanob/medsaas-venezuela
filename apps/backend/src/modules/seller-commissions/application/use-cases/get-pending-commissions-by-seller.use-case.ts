import { Inject, Injectable } from '@nestjs/common';
import {
  SELLER_COMMISSION_REPOSITORY,
  type ISellerCommissionRepository,
  type PendingBySeller,
} from '../../domain/repositories/seller-commission.repository';

/**
 * GetPendingCommissionsBySellerUseCase
 *
 * Admin-only. Returns all pending commissions grouped by seller,
 * with the total pending amount and the detail of each commission.
 *
 * SECURITY: Caller must have role='super_admin'. The controller enforces this
 * with @Roles('super_admin') + RolesGuard. sellerName and specialistName are PII.
 */
@Injectable()
export class GetPendingCommissionsBySellerUseCase {
  constructor(
    @Inject(SELLER_COMMISSION_REPOSITORY)
    private readonly repo: ISellerCommissionRepository,
  ) {}

  async execute(): Promise<PendingBySeller[]> {
    return this.repo.listPendingBySeller();
  }
}
