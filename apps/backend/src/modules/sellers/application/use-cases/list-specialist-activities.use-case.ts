import { Inject, Injectable } from '@nestjs/common';
import {
  SELLER_REPOSITORY,
  type ISellerRepository,
  type SpecialistActivityRow,
} from '../../domain/repositories/seller.repository';
import { SpecialistNotInPortfolioError } from '../../domain/errors/specialist-not-in-portfolio.error';

export interface ListSpecialistActivitiesResult {
  currentStatus: string;
  activities: SpecialistActivityRow[];
}

/**
 * ListSpecialistActivitiesUseCase
 *
 * Returns the full follow-up activity history for a specialist, together with
 * their current follow-up status.
 *
 * Anti-IDOR: verifies the specialist belongs to the authenticated seller via
 * findSoldSpecialist before fetching activities. The same opaque error is
 * returned whether the specialist does not exist or belongs to another seller.
 *
 * SECURITY: sellerId always comes from CurrentUserPayload.sub — never the body.
 */
@Injectable()
export class ListSpecialistActivitiesUseCase {
  constructor(
    @Inject(SELLER_REPOSITORY)
    private readonly sellerRepo: ISellerRepository,
  ) {}

  async execute(sellerId: string, specialistId: string): Promise<ListSpecialistActivitiesResult> {
    // Anti-IDOR: specialist must be in this seller's portfolio.
    const specialist = await this.sellerRepo.findSoldSpecialist(sellerId, specialistId);
    if (!specialist) {
      throw new SpecialistNotInPortfolioError();
    }

    const [activities, currentStatus] = await Promise.all([
      this.sellerRepo.listSpecialistActivitiesRaw(specialistId),
      this.sellerRepo.getSpecialistCurrentStatus(specialistId),
    ]);

    return { currentStatus, activities };
  }
}
