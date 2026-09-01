import { Inject, Injectable } from '@nestjs/common';
import {
  IProductRepository,
  PRODUCT_REPOSITORY,
} from '../../domain/repositories/iproduct.repository';
import { ProductNotFoundError } from '../../domain/errors/product-not-found.error';
import { IStoragePort, STORAGE_PORT } from '../../../storage/application/ports/storage.port';
import { toProductOutput, type ProductOutput } from './list-products.use-case';

/**
 * Returns a single product scoped to the authenticated doctor.
 *
 * SECURITY: uses the same error (ProductNotFoundError → 404) for both
 * missing products and products owned by other doctors — anti-IDOR.
 */
@Injectable()
export class GetProductUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly repo: IProductRepository,
    @Inject(STORAGE_PORT)
    private readonly storage: IStoragePort,
  ) {}

  async execute(id: string, doctorId: string): Promise<ProductOutput> {
    const product = await this.repo.findByIdForDoctor(id, doctorId);
    if (!product) {
      throw new ProductNotFoundError();
    }
    return toProductOutput(product, this.storage);
  }
}
