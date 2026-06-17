import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { WhereOptions } from 'sequelize';
import { IncomeConcept } from '../../../domain/entities/income-concept.entity';
import type { IIncomeConceptRepository } from '../../../domain/repositories/income-concept.repository';
import { IncomeConceptModel } from '../models/income-concept.model';

/**
 * Sequelize implementation of IIncomeConceptRepository.
 *
 * All SQL is mediated by sequelize-typescript. No business logic here.
 */
@Injectable()
export class SequelizeIncomeConceptRepository implements IIncomeConceptRepository {
  constructor(
    @InjectModel(IncomeConceptModel)
    private readonly model: typeof IncomeConceptModel,
  ) {}

  async findActiveByDoctor(doctorId: string): Promise<IncomeConcept[]> {
    const rows = await this.model.findAll({
      where: { doctorId, isActive: true } as WhereOptions,
      order: [
        ['sortOrder', 'ASC'],
        ['createdAt', 'ASC'],
      ],
    });
    return rows.map((r) => this.toDomain(r));
  }

  async findById(id: string): Promise<IncomeConcept | null> {
    const row = await this.model.findByPk(id);
    if (!row) return null;
    return this.toDomain(row);
  }

  async save(concept: IncomeConcept): Promise<IncomeConcept> {
    const row = await this.model.create({
      id: concept.id,
      doctorId: concept.doctorId,
      name: concept.name,
      isActive: concept.isActive,
      sortOrder: concept.sortOrder,
    });
    return this.toDomain(row);
  }

  async update(concept: IncomeConcept): Promise<IncomeConcept> {
    await this.model.update(
      {
        name: concept.name,
        isActive: concept.isActive,
        sortOrder: concept.sortOrder,
      },
      { where: { id: concept.id } as WhereOptions },
    );
    const updated = await this.model.findByPk(concept.id);
    // The record was just updated — it cannot be missing at this point.
    return this.toDomain(updated!);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toDomain(row: IncomeConceptModel): IncomeConcept {
    return IncomeConcept.create({
      id: row.id,
      doctorId: row.doctorId,
      name: row.name,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
