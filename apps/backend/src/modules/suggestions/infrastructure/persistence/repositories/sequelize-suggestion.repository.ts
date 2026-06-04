import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { WhereOptions } from 'sequelize';
import { Suggestion, type SuggestionStatus } from '../../../domain/entities/suggestion.entity';
import type {
  ISuggestionRepository,
  SuggestionListAllFilters,
} from '../../../domain/repositories/suggestion.repository';
import { DoctorSuggestionModel } from '../models/doctor-suggestion.model';

/**
 * Sequelize implementation of ISuggestionRepository.
 *
 * No encryption — suggestion content is not PHI.
 */
@Injectable()
export class SequelizeSuggestionRepository implements ISuggestionRepository {
  constructor(
    @InjectModel(DoctorSuggestionModel)
    private readonly suggestionModel: typeof DoctorSuggestionModel,
  ) {}

  async listForDoctor(doctorId: string): Promise<Suggestion[]> {
    const rows = await this.suggestionModel.findAll({
      where: { doctorId } as WhereOptions,
      order: [['createdAt', 'DESC']],
    });

    return rows.map((r) => this.toDomain(r));
  }

  async listAll(filters: SuggestionListAllFilters): Promise<Suggestion[]> {
    const where: Record<string, unknown> = {};
    if (filters.status) {
      where.status = filters.status;
    }

    const rows = await this.suggestionModel.findAll({
      where: where as WhereOptions,
      order: [['createdAt', 'DESC']],
    });

    return rows.map((r) => this.toDomain(r));
  }

  async findById(id: string): Promise<Suggestion | null> {
    const row = await this.suggestionModel.findOne({
      where: { id } as WhereOptions,
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  async create(suggestion: Suggestion): Promise<Suggestion> {
    const row = await this.suggestionModel.create({
      id: suggestion.id,
      doctorId: suggestion.doctorId,
      subject: suggestion.subject,
      message: suggestion.message,
      category: suggestion.category,
      status: suggestion.status,
      adminResponse: suggestion.adminResponse,
    });

    return this.toDomain(row);
  }

  async save(suggestion: Suggestion): Promise<Suggestion> {
    await this.suggestionModel.update(
      {
        status: suggestion.status,
        adminResponse: suggestion.adminResponse,
        updatedAt: suggestion.updatedAt,
      },
      {
        where: { id: suggestion.id } as WhereOptions,
      },
    );

    const updated = await this.suggestionModel.findOne({
      where: { id: suggestion.id } as WhereOptions,
    });

    if (!updated) {
      // Should not happen — we just updated it. Defensive guard.
      throw new Error(`Suggestion ${suggestion.id} not found after save`);
    }

    return this.toDomain(updated);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toDomain(row: DoctorSuggestionModel): Suggestion {
    return Suggestion.create({
      id: row.id,
      doctorId: row.doctorId,
      subject: row.subject,
      message: row.message,
      category: row.category,
      status: (row.status ?? 'pending') as SuggestionStatus,
      adminResponse: row.adminResponse,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
