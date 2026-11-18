import { Inject, Injectable } from '@nestjs/common';
import {
  SELLER_REPOSITORY,
  type ISellerRepository,
  type SellerSpecialistWithStats,
} from '../../domain/repositories/seller.repository';

/**
 * ListSellerSpecialistsUseCase
 *
 * Returns the list of specialists attributed to the given seller
 * (profiles.sold_by = sellerId), enriched with aggregate counts
 * (offices, consultations by origin, onboarding step, payment config).
 *
 * All counts are computed in a single SQL query in the repository —
 * this use case adds no extra queries.
 *
 * SECURITY: sellerId always comes from CurrentUserPayload.sub (session token).
 * The caller MUST NOT pass it from the request body or URL.
 */
@Injectable()
export class ListSellerSpecialistsUseCase {
  constructor(
    @Inject(SELLER_REPOSITORY)
    private readonly sellerRepo: ISellerRepository,
  ) {}

  async execute(sellerId: string): Promise<SellerSpecialistWithStats[]> {
    return this.sellerRepo.listSoldSpecialistsWithStats(sellerId);
  }
}
