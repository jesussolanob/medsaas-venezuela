import { Inject, Injectable } from '@nestjs/common';
import {
  INCOME_CONCEPT_REPOSITORY,
  type IIncomeConceptRepository,
} from '../../../domain/repositories/income-concept.repository';

export interface IncomeConceptItem {
  id: string;
  doctorId: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Returns the list of active income concepts for the authenticated doctor.
 * Ordered by sortOrder ASC (then createdAt ASC for ties).
 */
@Injectable()
export class ListIncomeConceptsUseCase {
  constructor(
    @Inject(INCOME_CONCEPT_REPOSITORY)
    private readonly repo: IIncomeConceptRepository,
  ) {}

  async execute(doctorId: string): Promise<IncomeConceptItem[]> {
    const concepts = await this.repo.findActiveByDoctor(doctorId);
    return concepts.map((c) => ({
      id: c.id,
      doctorId: c.doctorId,
      name: c.name,
      isActive: c.isActive,
      sortOrder: c.sortOrder,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }
}
