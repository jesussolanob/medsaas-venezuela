import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { literal } from 'sequelize';
import type { WhereOptions } from 'sequelize';
import { PatientRequest } from '../../../domain/entities/patient-request.entity';
import type { IPatientRequestRepository } from '../../../domain/repositories/patient-request.repository';
import { PatientRequestModel } from '../models/patient-request.model';

/**
 * Sequelize implementation of IPatientRequestRepository.
 *
 * No PHI stored in this table — token, title, description, status, and
 * timestamps are non-sensitive metadata. Response text might contain
 * patient-authored content but is not encrypted (consistent with ticket
 * text fields across the system).
 */
@Injectable()
export class SequelizePatientRequestRepository implements IPatientRequestRepository {
  constructor(
    @InjectModel(PatientRequestModel)
    private readonly model: typeof PatientRequestModel,
  ) {}

  async save(request: PatientRequest): Promise<PatientRequest> {
    const row = await this.model.create({
      id: request.id,
      doctorId: request.doctorId,
      patientId: request.patientId,
      token: request.token,
      title: request.title,
      description: request.description,
      responseText: request.responseText,
      status: request.status,
      failedAttempts: request.failedAttempts,
      lastCodeRequestedAt: request.lastCodeRequestedAt,
      fulfilledAt: request.fulfilledAt,
    });
    return this.toDomain(row);
  }

  async findByToken(token: string): Promise<PatientRequest | null> {
    const row = await this.model.findOne({ where: { token } as WhereOptions });
    if (!row) return null;
    return this.toDomain(row);
  }

  async findById(id: string, doctorId: string): Promise<PatientRequest | null> {
    const row = await this.model.findOne({ where: { id, doctorId } as WhereOptions });
    if (!row) return null;
    return this.toDomain(row);
  }

  async listByDoctor(doctorId: string): Promise<PatientRequest[]> {
    const rows = await this.model.findAll({
      where: { doctorId } as WhereOptions,
      order: [['created_at', 'DESC']],
    });
    return rows.map((r) => this.toDomain(r));
  }

  async incrementLinkFailedAttempts(id: string): Promise<void> {
    await this.model.update({ failedAttempts: literal('failed_attempts + 1') } as object, {
      where: { id } as WhereOptions,
    });
  }

  async updateLastCodeRequestedAt(id: string, at: Date): Promise<void> {
    await this.model.update({ lastCodeRequestedAt: at } as object, {
      where: { id } as WhereOptions,
    });
  }

  async markFulfilled(id: string, fulfilledAt: Date, responseText: string | null): Promise<void> {
    await this.model.update({ status: 'fulfilled', fulfilledAt, responseText } as object, {
      where: { id } as WhereOptions,
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toDomain(row: PatientRequestModel): PatientRequest {
    return PatientRequest.create({
      id: row.id,
      doctorId: row.doctorId,
      patientId: row.patientId,
      token: row.token,
      title: row.title,
      description: row.description ?? null,
      responseText: row.responseText ?? null,
      status: row.status as 'pending' | 'fulfilled' | 'revoked',
      failedAttempts: row.failedAttempts ?? 0,
      lastCodeRequestedAt: row.lastCodeRequestedAt ?? null,
      fulfilledAt: row.fulfilledAt ?? null,
      createdAt: row.createdAt,
    });
  }
}
