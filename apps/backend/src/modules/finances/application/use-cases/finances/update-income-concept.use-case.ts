import { Inject, Injectable } from '@nestjs/common';
import {
  INCOME_CONCEPT_REPOSITORY,
  type IIncomeConceptRepository,
} from '../../../domain/repositories/income-concept.repository';
import { IncomeConceptNotFoundError } from '../../../domain/errors/income-concept-not-found.error';
import { ForbiddenDomainError } from '../../../domain/errors/forbidden-domain.error';

export interface UpdateIncomeConceptInput {
  id: string;
  doctorId: string;
  name?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export interface IncomeConceptOutput {
  id: string;
  doctorId: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Updates an existing income concept.
 *
 * SECURITY:
 *   - doctorId from the authenticated user (anti-IDOR).
 *   - Throws IncomeConceptNotFoundError (404) if concept is absent.
 *   - Throws ForbiddenDomainError (403) if concept belongs to another doctor.
 */
@Injectable()
export class UpdateIncomeConceptUseCase {
  constructor(
    @Inject(INCOME_CONCEPT_REPOSITORY)
    private readonly repo: IIncomeConceptRepository,
  ) {}

  async execute(input: UpdateIncomeConceptInput): Promise<IncomeConceptOutput> {
    const concept = await this.repo.findById(input.id);
    if (!concept) throw new IncomeConceptNotFoundError();
    if (!concept.isOwnedBy(input.doctorId))
      throw new ForbiddenDomainError('Income concept does not belong to this doctor');

    const patched = concept.patch({
      name: input.name,
      isActive: input.isActive,
      sortOrder: input.sortOrder,
    });

    const saved = await this.repo.update(patched);
    return {
      id: saved.id,
      doctorId: saved.doctorId,
      name: saved.name,
      isActive: saved.isActive,
      sortOrder: saved.sortOrder,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };
  }
}
