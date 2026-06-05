import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  IQuickItemRepository,
  QUICK_ITEM_REPOSITORY,
} from '../../../domain/repositories/quick-item.repository';
import { QuickItem } from '../../../domain/entities/quick-item.entity';
import type { CreateQuickItemDto } from '@delta/shared-types';

@Injectable()
export class CreateQuickItemUseCase {
  constructor(
    @Inject(QUICK_ITEM_REPOSITORY)
    private readonly quickItemRepo: IQuickItemRepository,
  ) {}

  async execute(dto: CreateQuickItemDto, doctorId: string): Promise<QuickItem> {
    const item = QuickItem.create({
      id: randomUUID(),
      doctorId,
      itemType: dto.item_type,
      name: dto.name,
      category: dto.category ?? null,
      details: dto.details ?? null,
      createdAt: new Date(),
    });

    return this.quickItemRepo.create(item);
  }
}
