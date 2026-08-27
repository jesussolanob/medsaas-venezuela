import { Inject, Injectable } from '@nestjs/common';
import {
  SELLER_REPOSITORY,
  type ISellerRepository,
} from '../../domain/repositories/seller.repository';

export interface ValidateSellerCodeResult {
  valid: boolean;
  /** Seller's display name, or null when the code is invalid. */
  sellerName: string | null;
}

/**
 * ValidateSellerCodeUseCase
 *
 * Resolves a seller code to a human-readable name so the specialist can confirm
 * they typed the right code during registration. Called by the public endpoint
 * GET /api/public/seller-code/:code — no authentication required.
 *
 * Returns only { valid, sellerName }:
 *   - valid: true when the code exists, false otherwise.
 *   - sellerName: the seller's full name when valid, null when invalid.
 *
 * SECURITY:
 *   - NEVER exposes id, email, phone, or any other field from the seller profile.
 *   - Revealing whether a code exists is intentional (the specialist must be able
 *     to confirm their seller), but no further seller data is leaked.
 */
@Injectable()
export class ValidateSellerCodeUseCase {
  constructor(
    @Inject(SELLER_REPOSITORY)
    private readonly sellerRepo: ISellerRepository,
  ) {}

  async execute(code: string): Promise<ValidateSellerCodeResult> {
    const seller = await this.sellerRepo.findByCode(code.toUpperCase().trim());
    if (!seller) {
      return { valid: false, sellerName: null };
    }
    return { valid: true, sellerName: seller.fullName };
  }
}
