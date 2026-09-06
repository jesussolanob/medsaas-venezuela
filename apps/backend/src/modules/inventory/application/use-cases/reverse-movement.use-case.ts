import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  IProductRepository,
  PRODUCT_REPOSITORY,
} from '../../domain/repositories/iproduct.repository';
import { MovementNotFoundError } from '../../domain/errors/movement-not-found.error';
import { MovementCannotBeReversedError } from '../../domain/errors/movement-cannot-be-reversed.error';
import type { InventoryMovement } from '../../domain/entities/inventory-movement.entity';

/**
 * Reverses an inventory movement by creating a counter-entry.
 *
 * Business rules:
 *   - The movement must exist and be owned by the authenticated doctor (anti-IDOR).
 *   - Consultation-linked movements (consultationId != null) cannot be reversed
 *     manually — the billing flow owns those (ADR-054).
 *   - The counter-entry has qty = -original.qty and kind = 'adjustment'.
 *   - Everything happens in one transaction: insert counter-entry + update stock.
 *   - The unique partial index (WHERE reverses_movement_id IS NOT NULL) in the DB
 *     guarantees a movement is reversed at most once. The repo also checks before
 *     writing to give a user-friendly error instead of a constraint violation.
 */
@Injectable()
export class ReverseMovementUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly repo: IProductRepository,
  ) {}

  async execute(movementId: string, doctorId: string): Promise<InventoryMovement> {
    // Anti-IDOR: missing and foreign movements return the same 404 error.
    const original = await this.repo.findMovementByIdForDoctor(movementId, doctorId);
    if (!original) {
      throw new MovementNotFoundError();
    }

    // Consultation-linked movements are governed by approveWithExtras.
    // Manually reversing them would silently desync billing and inventory.
    if (original.consultationId !== null) {
      throw new MovementCannotBeReversedError();
    }

    return this.repo.reverseMovement(movementId, doctorId, randomUUID());
  }
}
