import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { CreateProductDto } from '@delta/shared-types';
import {
  IProductRepository,
  PRODUCT_REPOSITORY,
} from '../../domain/repositories/iproduct.repository';
import { IStoragePort, STORAGE_PORT } from '../../../storage/application/ports/storage.port';
import { Product } from '../../domain/entities/product.entity';
import { InvalidPhotoPathError } from '../../domain/errors/invalid-photo-path.error';
import { toProductOutput, type ProductOutput } from './list-products.use-case';

@Injectable()
export class CreateProductUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly repo: IProductRepository,
    @Inject(STORAGE_PORT)
    private readonly storage: IStoragePort,
  ) {}

  async execute(dto: CreateProductDto, doctorId: string): Promise<ProductOutput> {
    // E: validate photo_path is scoped to this doctor's prefix to prevent cross-doctor
    // URL signing (any other prefix could point to a patient document or another doctor's file).
    const expectedPrefix = `product/${doctorId}/`;
    if (dto.photo_path && !dto.photo_path.startsWith(expectedPrefix)) {
      throw new InvalidPhotoPathError();
    }

    const now = new Date();
    const product = Product.create({
      id: randomUUID(),
      doctorId,
      name: dto.name.trim(),
      description: (dto.description ?? '').trim(),
      supplier: dto.supplier?.trim() ?? null,
      photoPath: dto.photo_path ?? null,
      salePriceAmount: dto.sale_price_amount,
      salePriceCurrency: dto.sale_price_currency,
      stockQty: dto.stock_qty ?? 0,
      lowStockThreshold: dto.low_stock_threshold ?? null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    const saved = await this.repo.save(product);
    return toProductOutput(saved, this.storage);
  }
}
