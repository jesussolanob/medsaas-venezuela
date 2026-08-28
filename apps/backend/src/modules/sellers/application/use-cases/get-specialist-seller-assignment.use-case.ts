import { Inject, Injectable } from '@nestjs/common';
import {
  SELLER_REPOSITORY,
  type ISellerRepository,
  type SpecialistSellerAssignment,
} from '../../domain/repositories/seller.repository';

/**
 * GetSpecialistSellerAssignmentUseCase
 *
 * Returns the current seller attribution for a specialist profile so that the
 * admin's assign-seller flow can show a reconfirmation modal when the specialist
 * already has a seller ("you are about to move them from X to Y — confirm?").
 *
 * Returns null when the specialist profile does not exist. When the specialist
 * exists but has no seller, the struct is returned with sellerId / sellerName /
 * soldBySource all null.
 *
 * SECURITY:
 *   - specialistId comes from the URL parameter (ParseUUIDPipe validated).
 *   - sellerName is PII — callers must not log the result.
 */
@Injectable()
export class GetSpecialistSellerAssignmentUseCase {
  constructor(
    @Inject(SELLER_REPOSITORY)
    private readonly sellerRepo: ISellerRepository,
  ) {}

  async execute(specialistId: string): Promise<SpecialistSellerAssignment | null> {
    return this.sellerRepo.getSpecialistSellerAssignment(specialistId);
  }
}
