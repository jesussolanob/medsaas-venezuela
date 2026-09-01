import { Inject, Injectable } from '@nestjs/common';
import type { UpdateProductDto } from '@delta/shared-types';
import {
  IProductRepository,
  PRODUCT_REPOSITORY,
} from '../../domain/repositories/iproduct.repository';
import { IStoragePort, STORAGE_PORT } from '../../../storage/application/ports/storage.port';
import { InvalidPhotoPathError } from '../../domain/errors/invalid-photo-path.error';
import { toProductOutput, type ProductOutput } from './list-products.use-case';

@Injectable()
export class UpdateProductUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly repo: IProductRepository,
    @Inject(STORAGE_PORT)
    private readonly storage: IStoragePort,
  ) {}

  async execute(id: string, doctorId: string, dto: UpdateProductDto): Promise<ProductOutput> {
    // E: validate photo_path is scoped to this doctor's prefix (same guard as create).
    const expectedPrefix = `product/${doctorId}/`;
    if (dto.photo_path && !dto.photo_path.startsWith(expectedPrefix)) {
      throw new InvalidPhotoPathError();
    }

    const updated = await this.repo.update(id, doctorId, {
      name: dto.name,
      description: dto.description,
      supplier: dto.supplier,
      photoPath: dto.photo_path,
      salePriceAmount: dto.sale_price_amount,
      salePriceCurrency: dto.sale_price_currency,
      lowStockThreshold: dto.low_stock_threshold,
    });
    return toProductOutput(updated, this.storage);
  }
}
