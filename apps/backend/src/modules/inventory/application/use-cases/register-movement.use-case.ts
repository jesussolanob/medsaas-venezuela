import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { RegisterMovementDto } from '@delta/shared-types';
import {
  IProductRepository,
  PRODUCT_REPOSITORY,
} from '../../domain/repositories/iproduct.repository';
import { ProductNotFoundError } from '../../domain/errors/product-not-found.error';
import { ProductInactiveError } from '../../domain/errors/product-inactive.error';
import { InvalidQuantityError } from '../../domain/errors/invalid-quantity.error';
import { InventoryMovement } from '../../domain/entities/inventory-movement.entity';

/**
 * Registers a manual inventory movement (purchase, adjustment, loss).
 *
 * Sale movements are NEVER created manually through this use case.
 * Sales are created automatically by approveWithExtras in the consultation repo.
 *
 * Business rules:
 *   - Product must exist and be active.
 *   - qty must not be zero.
 *   - The movement is applied atomically (repo.applyMovement updates stock_qty).
 *   - Stock may go negative (spec §decisions: avisa, no bloquea).
 */
@Injectable()
export class RegisterMovementUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly repo: IProductRepository,
  ) {}

  async execute(
    productId: string,
    doctorId: string,
    dto: RegisterMovementDto,
  ): Promise<InventoryMovement> {
    const product = await this.repo.findByIdForDoctor(productId, doctorId);
    if (!product) {
      throw new ProductNotFoundError();
    }
    if (!product.isActive) {
      throw new ProductInactiveError();
    }
    if (dto.qty === 0) {
      throw new InvalidQuantityError();
    }

    // Sign convention: purchase/adjustment credit → positive; loss/debit → negative.
    // The client sends the magnitude; we apply the correct sign here.
    const signedQty =
      dto.kind === 'purchase'
        ? Math.abs(dto.qty)
        : dto.kind === 'loss'
          ? -Math.abs(dto.qty)
          : dto.qty; // 'adjustment' allows any sign from the client

    const movement = InventoryMovement.create({
      id: randomUUID(),
      doctorId,
      productId,
      kind: dto.kind,
      qty: signedQty,
      unitPriceUsd: null,
      rateUsed: null,
      rateSource: null,
      consultationId: null,
      note: dto.note ?? null,
      createdAt: new Date(),
      reversesMovementId: null,
    });

    return this.repo.applyMovement(movement);
  }
}
