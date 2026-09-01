import { Inject, Injectable } from '@nestjs/common';
import {
  IProductRepository,
  PRODUCT_REPOSITORY,
  type MovementListResult,
} from '../../domain/repositories/iproduct.repository';
import { ProductNotFoundError } from '../../domain/errors/product-not-found.error';

@Injectable()
export class ListMovementsUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly repo: IProductRepository,
  ) {}

  async execute(
    productId: string,
    doctorId: string,
    page: number,
    limit: number,
  ): Promise<MovementListResult> {
    // Verify ownership before exposing movement history (anti-IDOR).
    const product = await this.repo.findByIdForDoctor(productId, doctorId);
    if (!product) {
      throw new ProductNotFoundError();
    }

    return this.repo.listMovements(productId, doctorId, page, limit);
  }
}
