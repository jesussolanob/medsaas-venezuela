import { Inject, Injectable } from '@nestjs/common';
import {
  SELLER_REPOSITORY,
  type ISellerRepository,
  type SellerSpecialistRow,
} from '../../domain/repositories/seller.repository';

/**
 * ListSellerSpecialistsUseCase
 *
 * Returns the list of specialists that were attributed to the given seller
 * (i.e. rows where profiles.sold_by = sellerId).
 *
 * SECURITY: sellerId always comes from CurrentUserPayload.sub (session token).
 * The caller MUST NOT pass it from the request body.
 */
@Injectable()
export class ListSellerSpecialistsUseCase {
  constructor(
    @Inject(SELLER_REPOSITORY)
    private readonly sellerRepo: ISellerRepository,
  ) {}

  async execute(sellerId: string): Promise<SellerSpecialistRow[]> {
    return this.sellerRepo.listSoldSpecialists(sellerId);
  }
}
