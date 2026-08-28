import { Inject, Injectable } from '@nestjs/common';
import {
  SELLER_COMMISSION_REPOSITORY,
  type ISellerCommissionRepository,
} from '../../domain/repositories/seller-commission.repository';
import type { SellerPayment } from '../../domain/entities/seller-payment.entity';

/**
 * GetSellerPaymentsUseCase
 *
 * Returns the payment history for a seller (includes receipt URL when set).
 * Used by both the seller portal (own payments) and the admin view (any seller).
 *
 * SECURITY: sellerId must always come from the authenticated session for the
 * seller portal endpoint. For the admin endpoint, it comes from a URL param
 * but is guarded by @Roles('super_admin').
 */
@Injectable()
export class GetSellerPaymentsUseCase {
  constructor(
    @Inject(SELLER_COMMISSION_REPOSITORY)
    private readonly repo: ISellerCommissionRepository,
  ) {}

  async execute(sellerId: string): Promise<SellerPayment[]> {
    return this.repo.listPaymentsBySeller(sellerId);
  }
}
