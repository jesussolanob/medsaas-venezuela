import { Inject, Injectable } from '@nestjs/common';
import {
  SELLER_COMMISSION_REPOSITORY,
  type ISellerCommissionRepository,
} from '../../domain/repositories/seller-commission.repository';
import { CommissionSellerNotFoundError } from '../../domain/errors/commission-seller-not-found.error';
import { CommissionSpecialistNotFoundError } from '../../domain/errors/commission-specialist-not-found.error';

export interface AssignSpecialistToSellerInput {
  specialistId: string;
  newSellerId: string;
}

/**
 * AssignSpecialistToSellerUseCase
 *
 * Admin-only. Re-assigns a specialist to a different seller.
 *
 * Unlike the onboarding path (WHERE sold_by IS NULL), this intentionally
 * overwrites any existing sold_by attribution. The ADR-037 "one-write" rule
 * applies ONLY to the self-registration code path; admin assignment is an
 * explicit override by a super_admin.
 *
 * Side effects:
 *   - Writes sold_by = newSellerId and sold_by_source = 'admin'.
 *   - Inserts a seller_attribution_log row (who reassigned, from whom, to whom, when).
 *   - Does NOT generate any commission — the plan commission fires when the plan
 *     CHANGES, not when the seller is assigned.
 *
 * SECURITY:
 *   - adminId always comes from the authenticated session (anti-IDOR).
 *   - specialistId and newSellerId are validated against the DB before writing.
 */
@Injectable()
export class AssignSpecialistToSellerUseCase {
  constructor(
    @Inject(SELLER_COMMISSION_REPOSITORY)
    private readonly repo: ISellerCommissionRepository,
  ) {}

  async execute(input: AssignSpecialistToSellerInput, adminId: string): Promise<void> {
    // 1. Validate seller exists and is active
    const seller = await this.repo.findSellerById(input.newSellerId);
    if (!seller || !seller.isActive) {
      throw new CommissionSellerNotFoundError();
    }

    // 2. Validate specialist exists
    const specialist = await this.repo.findSpecialistById(input.specialistId);
    if (!specialist) {
      throw new CommissionSpecialistNotFoundError();
    }

    // 3. Assign (overwrites existing sold_by, logs the change)
    await this.repo.assignSpecialistToSeller({
      specialistId: input.specialistId,
      newSellerId: input.newSellerId,
      previousSellerId: specialist.soldBy,
      assignedBy: adminId,
    });
  }
}
