import { Inject, Injectable } from '@nestjs/common';
import {
  SELLER_REPOSITORY,
  type ISellerRepository,
  type SellerProfile,
} from '../../domain/repositories/seller.repository';
import { SellerCodeNotFoundError } from '../../domain/errors/seller-code-not-found.error';

/**
 * GetSellerProfileUseCase
 *
 * Returns the seller's own profile — specifically their code and display name —
 * so they can copy and share their code with prospects.
 *
 * Throws SellerCodeNotFoundError (422) when the authenticated user's id does
 * not correspond to any active seller profile. This should never happen in
 * normal operation (the role guard already ensures the caller has role=seller)
 * but is handled defensively.
 *
 * SECURITY: sellerId always comes from CurrentUserPayload.sub — never from the
 * request body or query string.
 */
@Injectable()
export class GetSellerProfileUseCase {
  constructor(
    @Inject(SELLER_REPOSITORY)
    private readonly sellerRepo: ISellerRepository,
  ) {}

  async execute(sellerId: string): Promise<SellerProfile> {
    const seller = await this.sellerRepo.findById(sellerId);
    if (!seller) {
      throw new SellerCodeNotFoundError();
    }
    return seller;
  }
}
