import { Inject, Injectable } from '@nestjs/common';
import {
  IQuickItemRepository,
  QUICK_ITEM_REPOSITORY,
} from '../../../domain/repositories/quick-item.repository';

@Injectable()
export class DeleteQuickItemUseCase {
  constructor(
    @Inject(QUICK_ITEM_REPOSITORY)
    private readonly quickItemRepo: IQuickItemRepository,
  ) {}

  async execute(itemId: string, doctorId: string): Promise<void> {
    // Repository scopes delete to (id, doctorId) and throws QuickItemNotFoundError
    // when the record does not exist or belongs to another doctor.
    await this.quickItemRepo.delete(itemId, doctorId);
  }
}
