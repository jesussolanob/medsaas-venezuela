import { Inject, Injectable } from '@nestjs/common';
import {
  IQuickItemRepository,
  QUICK_ITEM_REPOSITORY,
} from '../../../domain/repositories/quick-item.repository';
import type { QuickItem, QuickItemType } from '../../../domain/entities/quick-item.entity';

@Injectable()
export class ListQuickItemsUseCase {
  constructor(
    @Inject(QUICK_ITEM_REPOSITORY)
    private readonly quickItemRepo: IQuickItemRepository,
  ) {}

  async execute(doctorId: string, itemType?: QuickItemType): Promise<QuickItem[]> {
    return this.quickItemRepo.listByDoctor(doctorId, itemType);
  }
}
