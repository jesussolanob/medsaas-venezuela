import { Inject, Injectable } from '@nestjs/common';
import {
  SELLER_REPOSITORY,
  type ISellerRepository,
  type SellerPaymentDetails,
} from '../../domain/repositories/seller.repository';
import { SellerNotFoundError } from '../../domain/errors/seller-not-found.error';

/**
 * GetAdminSellerPaymentDetailsUseCase
 *
 * Returns the payment configuration for any seller by id.
 * Intended for the super_admin panel — the controller enforces the role guard.
 *
 * SECURITY:
 *   - Requires @Roles('super_admin') on the calling controller method.
 *   - Returned data is financial — callers must not log it.
 *   - The sellerId is taken from the URL parameter (admin names any seller),
 *     not from the session.
 */
@Injectable()
export class GetAdminSellerPaymentDetailsUseCase {
  constructor(
    @Inject(SELLER_REPOSITORY)
    private readonly sellerRepo: ISellerRepository,
  ) {}

  async execute(sellerId: string): Promise<SellerPaymentDetails> {
    const result = await this.sellerRepo.getSellerPaymentDetails(sellerId);
    if (!result) {
      throw new SellerNotFoundError();
    }
    return result;
  }
}
