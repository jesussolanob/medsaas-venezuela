import { Inject, Injectable } from '@nestjs/common';
import type { Promotion } from '../../../domain/entities/promotion.entity';
import {
  IPromotionRepository,
  PROMOTION_REPOSITORY,
} from '../../../domain/repositories/promotion.repository';

@Injectable()
export class ListActivePromotionsUseCase {
  constructor(
    @Inject(PROMOTION_REPOSITORY)
    private readonly promotionRepo: IPromotionRepository,
  ) {}

  async execute(): Promise<Promotion[]> {
    return this.promotionRepo.listActive();
  }
}
