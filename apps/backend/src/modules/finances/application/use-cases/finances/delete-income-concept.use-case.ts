import { Inject, Injectable } from '@nestjs/common';
import {
  INCOME_CONCEPT_REPOSITORY,
  type IIncomeConceptRepository,
} from '../../../domain/repositories/income-concept.repository';
import { IncomeConceptNotFoundError } from '../../../domain/errors/income-concept-not-found.error';
import { ForbiddenDomainError } from '../../../domain/errors/forbidden-domain.error';

export interface DeleteIncomeConceptInput {
  id: string;
  doctorId: string;
}

/**
 * Soft-deletes an income concept by setting is_active = false.
 *
 * Soft delete is chosen over hard delete so that existing income_transactions
 * that reference this concept via concept_id keep a valid FK and historical
 * data integrity is preserved.
 *
 * SECURITY:
 *   - doctorId from the authenticated user (anti-IDOR).
 *   - Throws IncomeConceptNotFoundError (404) if absent.
 *   - Throws ForbiddenDomainError (403) if owned by another doctor.
 */
@Injectable()
export class DeleteIncomeConceptUseCase {
  constructor(
    @Inject(INCOME_CONCEPT_REPOSITORY)
    private readonly repo: IIncomeConceptRepository,
  ) {}

  async execute(input: DeleteIncomeConceptInput): Promise<void> {
    const concept = await this.repo.findById(input.id);
    if (!concept) throw new IncomeConceptNotFoundError();
    if (!concept.isOwnedBy(input.doctorId))
      throw new ForbiddenDomainError('Income concept does not belong to this doctor');

    const deactivated = concept.patch({ isActive: false });
    await this.repo.update(deactivated);
  }
}
