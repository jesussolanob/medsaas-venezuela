import { Inject, Injectable } from '@nestjs/common';
import type { Promotion } from '../../../domain/entities/promotion.entity';
import { PromotionNotFoundError } from '../../../domain/errors/promotion-not-found.error';
import { Promotion as PromotionEntity } from '../../../domain/entities/promotion.entity';
import {
  IPromotionRepository,
  PROMOTION_REPOSITORY,
} from '../../../domain/repositories/promotion.repository';

export interface UpdatePromotionInput {
  promotionId: string;
  planKey?: string;
  durationMonths?: number;
  originalPriceUsd?: number;
  promoPriceUsd?: number;
  label?: string | null;
  isActive?: boolean;
  endsAt?: Date | null;
}

@Injectable()
export class UpdatePromotionUseCase {
  constructor(
    @Inject(PROMOTION_REPOSITORY)
    private readonly promotionRepo: IPromotionRepository,
  ) {}

  async execute(input: UpdatePromotionInput): Promise<Promotion> {
    const existing = await this.promotionRepo.findById(input.promotionId);
    if (!existing) {
      throw new PromotionNotFoundError();
    }

    // Resolve the effective values after the partial update to validate invariants.
    const effectiveOriginal = input.originalPriceUsd ?? existing.originalPriceUsd;
    const effectivePromo = input.promoPriceUsd ?? existing.promoPriceUsd;
    const effectiveDuration = input.durationMonths ?? existing.durationMonths;

    PromotionEntity.validateInvariants(effectivePromo, effectiveOriginal, effectiveDuration);

    const { promotionId: _id, ...fields } = input;

    return this.promotionRepo.update(input.promotionId, fields);
  }
}
