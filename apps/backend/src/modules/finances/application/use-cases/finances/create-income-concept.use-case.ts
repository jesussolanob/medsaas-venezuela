import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  INCOME_CONCEPT_REPOSITORY,
  type IIncomeConceptRepository,
} from '../../../domain/repositories/income-concept.repository';
import { IncomeConcept } from '../../../domain/entities/income-concept.entity';

export interface CreateIncomeConceptInput {
  doctorId: string;
  name: string;
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
 * Creates a new income concept for the authenticated doctor.
 */
@Injectable()
export class CreateIncomeConceptUseCase {
  constructor(
    @Inject(INCOME_CONCEPT_REPOSITORY)
    private readonly repo: IIncomeConceptRepository,
  ) {}

  async execute(input: CreateIncomeConceptInput): Promise<IncomeConceptOutput> {
    const now = new Date();
    const concept = IncomeConcept.create({
      id: randomUUID(),
      doctorId: input.doctorId,
      name: input.name,
      isActive: true,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });

    const saved = await this.repo.save(concept);
    return this.toOutput(saved);
  }

  private toOutput(c: IncomeConcept): IncomeConceptOutput {
    return {
      id: c.id,
      doctorId: c.doctorId,
      name: c.name,
      isActive: c.isActive,
      sortOrder: c.sortOrder,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }
}
