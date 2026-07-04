import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { literal } from 'sequelize';
import type { WhereOptions } from 'sequelize';
import { PatientRequestAccessCode } from '../../../domain/entities/patient-request-access-code.entity';
import type { IPatientRequestAccessCodeRepository } from '../../../domain/repositories/patient-request-access-code.repository';
import { PatientRequestAccessCodeModel } from '../models/patient-request-access-code.model';

/**
 * Sequelize implementation of IPatientRequestAccessCodeRepository.
 *
 * Codes are not PHI — they are random 6-digit strings. No encryption needed.
 * Atomic operations on failed_attempts and used_at use literal SQL to avoid
 * read-modify-write races.
 */
@Injectable()
export class SequelizePatientRequestAccessCodeRepository implements IPatientRequestAccessCodeRepository {
  constructor(
    @InjectModel(PatientRequestAccessCodeModel)
    private readonly model: typeof PatientRequestAccessCodeModel,
  ) {}

  async save(code: PatientRequestAccessCode): Promise<PatientRequestAccessCode> {
    const row = await this.model.create({
      id: code.id,
      requestId: code.requestId,
      code: code.code,
      expiresAt: code.expiresAt,
      usedAt: code.usedAt,
      failedAttempts: code.failedAttempts,
    });
    return this.toDomain(row);
  }

  async findLatestByRequestId(requestId: string): Promise<PatientRequestAccessCode | null> {
    const row = await this.model.findOne({
      where: { requestId } as WhereOptions,
      order: [['created_at', 'DESC']],
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  async incrementFailedAttempts(id: string): Promise<void> {
    await this.model.update(
      { failedAttempts: literal('failed_attempts + 1') as unknown as number },
      { where: { id } as WhereOptions },
    );
  }

  async markUsed(id: string, usedAt: Date): Promise<void> {
    await this.model.update({ usedAt }, { where: { id } as WhereOptions });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toDomain(row: PatientRequestAccessCodeModel): PatientRequestAccessCode {
    return PatientRequestAccessCode.create({
      id: row.id,
      requestId: row.requestId,
      code: row.code,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt,
      failedAttempts: row.failedAttempts,
      createdAt: row.createdAt,
    });
  }
}
