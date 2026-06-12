import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { CredentialVerificationModel } from '../models/credential-verification.model';
import type {
  ICredentialVerificationRepository,
  UpsertVerificationParams,
} from '../../../domain/repositories/credential-verification.repository';
import {
  CredentialVerification,
  type VerificationStatus,
  type VerificationEvidence,
} from '../../../domain/entities/credential-verification.entity';

@Injectable()
export class SequelizeCredentialVerificationRepository implements ICredentialVerificationRepository {
  constructor(
    @InjectModel(CredentialVerificationModel)
    private readonly model: typeof CredentialVerificationModel,
  ) {}

  async findByDoctorAndType(
    doctorId: string,
    credentialType: string,
  ): Promise<CredentialVerification | null> {
    const row = await this.model.findOne({ where: { doctorId, credentialType } });
    return row ? this.toDomain(row) : null;
  }

  async findAllByDoctor(doctorId: string): Promise<CredentialVerification[]> {
    const rows = await this.model.findAll({
      where: { doctorId },
      order: [['credentialType', 'ASC']],
    });
    return rows.map((r) => this.toDomain(r));
  }

  async upsert(params: UpsertVerificationParams): Promise<CredentialVerification> {
    const existing = await this.model.findOne({
      where: { doctorId: params.doctorId, credentialType: params.credentialType },
    });

    if (existing) {
      await existing.update({
        declaredValue: params.declaredValue,
        verifierId: params.verifierId,
        status: params.status,
        evidence: params.evidence as Record<string, unknown> | null,
        checkedAt: params.checkedAt,
        lastError: params.lastError,
        attempts: existing.attempts + 1,
      });
      return this.toDomain(existing);
    }

    const created = await this.model.create({
      doctorId: params.doctorId,
      credentialType: params.credentialType,
      declaredValue: params.declaredValue,
      verifierId: params.verifierId,
      status: params.status,
      evidence: params.evidence as Record<string, unknown> | null,
      checkedAt: params.checkedAt,
      lastError: params.lastError,
      attempts: 1,
    });
    return this.toDomain(created);
  }

  // ---------------------------------------------------------------------------
  // Mapper
  // ---------------------------------------------------------------------------

  private toDomain(row: CredentialVerificationModel): CredentialVerification {
    return CredentialVerification.create({
      id: row.id,
      doctorId: row.doctorId,
      credentialType: row.credentialType,
      declaredValue: row.declaredValue,
      verifierId: row.verifierId,
      status: row.status as VerificationStatus,
      evidence: (row.evidence ?? null) as VerificationEvidence | null,
      checkedAt: row.checkedAt,
      attempts: row.attempts,
      lastError: row.lastError,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
