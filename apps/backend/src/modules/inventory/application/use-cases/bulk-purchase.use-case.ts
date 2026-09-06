import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { BulkPurchaseDto } from '@delta/shared-types';
import {
  IProductRepository,
  PRODUCT_REPOSITORY,
} from '../../domain/repositories/iproduct.repository';
import { ProductNotFoundError } from '../../domain/errors/product-not-found.error';
import { ProductInactiveError } from '../../domain/errors/product-inactive.error';
import { InventoryMovement } from '../../domain/entities/inventory-movement.entity';

/**
 * Creates multiple purchase movements in a single atomic transaction.
 *
 * Business rules:
 *   - All product_ids must belong to the authenticated doctor.
 *   - All products must be active.
 *   - qty must be positive (purchases are stock entries). Validation is done
 *     by the Zod schema at the controller level (.positive() constraint).
 *   - If any write fails, the whole transaction rolls back — no partial state.
 *   - Maximum 200 items per batch (enforced by the Zod schema).
 *
 * Note: findProductsByIdsForDoctor uses Op.in (IN operator) — never = ANY() — per ADR-059.
 */
@Injectable()
export class BulkPurchaseUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly repo: IProductRepository,
  ) {}

  async execute(doctorId: string, dto: BulkPurchaseDto): Promise<InventoryMovement[]> {
    const ids = dto.items.map((item) => item.product_id);

    // Validate all product IDs belong to the doctor.
    // findProductsByIdsForDoctor silently excludes unknown/foreign IDs.
    const products = await this.repo.findProductsByIdsForDoctor(ids, doctorId);

    if (products.length !== ids.length) {
      // At least one product is missing or belongs to another doctor.
      throw new ProductNotFoundError();
    }

    // Validate all products are active. Finding the first inactive one is enough.
    const inactive = products.find((p) => !p.isActive);
    if (inactive) {
      throw new ProductInactiveError();
    }

    const now = new Date();
    const movements = dto.items.map((item) =>
      InventoryMovement.create({
        id: randomUUID(),
        doctorId,
        productId: item.product_id,
        kind: 'purchase',
        qty: Math.abs(item.qty), // positive: purchase = stock entry
        unitPriceUsd: item.unit_price_usd ?? null,
        rateUsed: null,
        rateSource: null,
        consultationId: null,
        note: dto.note ?? null,
        createdAt: now,
        reversesMovementId: null,
      }),
    );

    return this.repo.applyBulkMovements(movements);
  }
}
