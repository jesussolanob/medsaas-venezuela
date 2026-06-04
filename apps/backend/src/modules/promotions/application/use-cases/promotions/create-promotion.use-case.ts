import { Inject, Injectable } from '@nestjs/common';
import type { Promotion } from '../../../domain/entities/promotion.entity';
import { Promotion as PromotionEntity } from '../../../domain/entities/promotion.entity';
import {
  IPromotionRepository,
  PROMOTION_REPOSITORY,
} from '../../../domain/repositories/promotion.repository';

export interface CreatePromotionInput {
  planKey: string;
  durationMonths: number;
  originalPriceUsd: number;
  promoPriceUsd: number;
  label?: string | null;
  isActive?: boolean;
  endsAt?: Date | null;
}

@Injectable()
export class CreatePromotionUseCase {
  constructor(
    @Inject(PROMOTION_REPOSITORY)
    private readonly promotionRepo: IPromotionRepository,
  ) {}

  async execute(input: CreatePromotionInput): Promise<Promotion> {
    // Validate domain invariants before persisting.
    PromotionEntity.validateInvariants(
      input.promoPriceUsd,
      input.originalPriceUsd,
      input.durationMonths,
    );

    const label =
      input.label !== undefined && input.label !== null
        ? input.label
        : `Oferta ${input.durationMonths} meses`;

    return this.promotionRepo.create({
      planKey: input.planKey,
      durationMonths: input.durationMonths,
      originalPriceUsd: input.originalPriceUsd,
      promoPriceUsd: input.promoPriceUsd,
      label,
      isActive: input.isActive !== undefined ? input.isActive : true,
      endsAt: input.endsAt ?? null,
    });
  }
}
