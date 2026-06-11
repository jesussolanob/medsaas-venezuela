import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { WhereOptions } from 'sequelize';
import { UniqueConstraintError } from 'sequelize';
import { PatientIdentity } from '../../../domain/entities/patient-identity.entity';
import { PatientIdentityConflictError } from '../../../domain/errors/patient-identity.errors';
import type { IPatientIdentityRepository } from '../../../domain/repositories/patient-identity.repository';
import { PatientIdentityModel } from '../models/patient-identity.model';

/**
 * Sequelize implementation of IPatientIdentityRepository.
 *
 * PRIVACY: This repository performs no HTTP I/O and is never used from
 * controllers. It is injected only by PatientIdentityService.
 */
@Injectable()
export class SequelizePatientIdentityRepository implements IPatientIdentityRepository {
  constructor(
    @InjectModel(PatientIdentityModel)
    private readonly model: typeof PatientIdentityModel,
  ) {}

  async findByCedulaHash(cedulaHash: string): Promise<PatientIdentity | null> {
    const row = await this.model.findOne({
      where: { cedulaHash } as WhereOptions,
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  async save(identity: PatientIdentity): Promise<PatientIdentity> {
    try {
      const row = await this.model.create({
        id: identity.id,
        cedulaHash: identity.cedulaHash,
        cedulaEncrypted: identity.cedulaEncrypted,
      });
      return this.toDomain(row);
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        throw new PatientIdentityConflictError();
      }
      throw err;
    }
  }

  private toDomain(row: PatientIdentityModel): PatientIdentity {
    return PatientIdentity.create({
      id: row.id,
      cedulaHash: row.cedulaHash,
      cedulaEncrypted: row.cedulaEncrypted,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
