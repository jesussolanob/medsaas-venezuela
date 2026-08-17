import { Inject, Injectable } from '@nestjs/common';
import {
  SELLER_REPOSITORY,
  type ISellerRepository,
  type SellerSpecialistRow,
} from '../../domain/repositories/seller.repository';
import { SellerCodeNotFoundError } from '../../domain/errors/seller-code-not-found.error';

/**
 * GetSellerSpecialistUseCase
 *
 * Returns the detail of a single specialist attributed to the given seller.
 * Throws SellerCodeNotFoundError (422) when the specialist does not exist or
 * belongs to a different seller — both cases return the same error to prevent
 * enumeration of other sellers' portfolios (anti-IDOR).
 *
 * SECURITY: sellerId always comes from CurrentUserPayload.sub — never the body.
 */
@Injectable()
export class GetSellerSpecialistUseCase {
  constructor(
    @Inject(SELLER_REPOSITORY)
    private readonly sellerRepo: ISellerRepository,
  ) {}

  async execute(sellerId: string, specialistId: string): Promise<SellerSpecialistRow> {
    const specialist = await this.sellerRepo.findSoldSpecialist(sellerId, specialistId);
    if (!specialist) {
      // Same error for "not found" and "belongs to another seller" — prevents
      // enumeration of specialists across sellers.
      throw new SellerCodeNotFoundError();
    }
    return specialist;
  }
}
