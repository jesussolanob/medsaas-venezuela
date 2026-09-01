import { Inject, Injectable } from '@nestjs/common';
import type { ListProductsQuery } from '@delta/shared-types';
import {
  IProductRepository,
  PRODUCT_REPOSITORY,
  type ProductListResult,
} from '../../domain/repositories/iproduct.repository';
import { IStoragePort, STORAGE_PORT } from '../../../storage/application/ports/storage.port';
import type { Product } from '../../domain/entities/product.entity';

export interface ProductOutput {
  id: string;
  doctorId: string;
  name: string;
  description: string;
  supplier: string | null;
  /** Signed URL (1 h TTL) when photo_path is set; null otherwise. */
  photoUrl: string | null;
  salePriceAmount: number;
  salePriceCurrency: string;
  stockQty: number;
  lowStockThreshold: number | null;
  isActive: boolean;
  isLowStock: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListProductsResult {
  items: ProductOutput[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Converts a photo_path to a signed URL; never persists the signed URL.
 *
 * Defense-in-depth: validates the path starts with the `product/` namespace
 * before signing. Write-time validation in create/update use cases is the
 * primary control; this guard prevents any pre-existing malformed path (e.g.,
 * migrated data pointing to `document/` or `avatar/`) from generating a URL.
 *
 * NOTE: Full routing through GetSignedUrlUseCase was evaluated and skipped
 * because that use case has an HTTP-level signature (requires request context),
 * and injecting it here would create an unnecessary coupling. The write-time
 * prefix enforcement is the strong control; this guard is the safety net.
 */
async function resolvePhotoUrl(
  photoPath: string | null,
  storagePort: IStoragePort,
): Promise<string | null> {
  if (!photoPath) return null;
  // Reject any path that escapes the product namespace.
  if (!photoPath.startsWith('product/')) return null;
  return storagePort.getSignedUrl(photoPath);
}

export async function toProductOutput(
  p: Product,
  storagePort: IStoragePort,
): Promise<ProductOutput> {
  return {
    id: p.id,
    doctorId: p.doctorId,
    name: p.name,
    description: p.description,
    supplier: p.supplier,
    photoUrl: await resolvePhotoUrl(p.photoPath, storagePort),
    salePriceAmount: p.salePriceAmount,
    salePriceCurrency: p.salePriceCurrency,
    stockQty: p.stockQty,
    lowStockThreshold: p.lowStockThreshold,
    isActive: p.isActive,
    isLowStock: p.isLowStock(),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

@Injectable()
export class ListProductsUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly repo: IProductRepository,
    @Inject(STORAGE_PORT)
    private readonly storage: IStoragePort,
  ) {}

  async execute(doctorId: string, query: ListProductsQuery): Promise<ListProductsResult> {
    const result: ProductListResult = await this.repo.list({
      doctorId,
      search: query.search,
      active: query.active,
      page: query.page,
      limit: query.limit,
    });

    const items = await Promise.all(result.items.map((p) => toProductOutput(p, this.storage)));

    return {
      items,
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }
}
