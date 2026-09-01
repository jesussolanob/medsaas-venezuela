import { Inject, Injectable } from '@nestjs/common';
import {
  IProductRepository,
  PRODUCT_REPOSITORY,
} from '../../domain/repositories/iproduct.repository';

/**
 * Soft-deletes a product (sets is_active = false).
 *
 * NEVER hard-deletes: the product may be referenced by existing
 * inventory_movements and consultation_extra_items.
 */
@Injectable()
export class DeactivateProductUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly repo: IProductRepository,
  ) {}

  async execute(id: string, doctorId: string): Promise<void> {
    await this.repo.deactivate(id, doctorId);
  }
}
