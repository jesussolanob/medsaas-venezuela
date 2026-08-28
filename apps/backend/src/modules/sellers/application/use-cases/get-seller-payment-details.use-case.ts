import { Inject, Injectable } from '@nestjs/common';
import {
  SELLER_REPOSITORY,
  type ISellerRepository,
  type SellerPaymentDetails,
} from '../../domain/repositories/seller.repository';
import { SellerNotFoundError } from '../../domain/errors/seller-not-found.error';

/**
 * GetSellerPaymentDetailsUseCase
 *
 * Returns the authenticated seller's own payment configuration
 * (how Delta pays their commissions: bank transfer, pago móvil, etc.).
 *
 * SECURITY:
 *   - sellerId MUST come from the authenticated session (CurrentUser().sub).
 *     Never from the request body or query string.
 *   - Returned data is financial — callers must not log it.
 */
@Injectable()
export class GetSellerPaymentDetailsUseCase {
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
