import { Inject, Injectable } from '@nestjs/common';
import { PromotionNotFoundError } from '../../../domain/errors/promotion-not-found.error';
import {
  IPromotionRepository,
  PROMOTION_REPOSITORY,
} from '../../../domain/repositories/promotion.repository';

export interface DeletePromotionInput {
  promotionId: string;
}

@Injectable()
export class DeletePromotionUseCase {
  constructor(
    @Inject(PROMOTION_REPOSITORY)
    private readonly promotionRepo: IPromotionRepository,
  ) {}

  async execute(input: DeletePromotionInput): Promise<void> {
    const existing = await this.promotionRepo.findById(input.promotionId);
    if (!existing) {
      throw new PromotionNotFoundError();
    }

    await this.promotionRepo.delete(input.promotionId);
  }
}
