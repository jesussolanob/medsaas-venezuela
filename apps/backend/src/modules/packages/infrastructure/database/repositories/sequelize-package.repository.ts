import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import type { WhereOptions } from 'sequelize';
import { PatientPackage } from '../../../domain/entities/patient-package.entity';
import type { IPackageRepository } from '../../../domain/repositories/package.repository';
import { PatientPackageModel } from '../models/patient-package.model';
import { PatientModel } from '../../../../patients/infrastructure/database/models/patient.model';

@Injectable()
export class SequelizePackageRepository implements IPackageRepository {
  constructor(
    @InjectModel(PatientPackageModel)
    private readonly packageModel: typeof PatientPackageModel,
    @InjectModel(PatientModel)
    private readonly patientModel: typeof PatientModel,
    private readonly sequelize: Sequelize,
  ) {}

  async findById(id: string): Promise<PatientPackage | null> {
    const row = await this.packageModel.findByPk(id);
    if (!row) return null;
    return this.toDomain(row);
  }

  async findByPatientId(patientId: string, doctorId: string): Promise<PatientPackage[]> {
    const rows = await this.packageModel.findAll({
      where: { patientId, doctorId } as WhereOptions,
      order: [['createdAt', 'DESC']],
    });
    return rows.map((r) => this.toDomain(r));
  }

  async findActiveByEmailHash(emailHash: string, doctorId: string): Promise<PatientPackage[]> {
    // Find patient by email hash for this doctor, then fetch their active packages.
    // We only use the email_search_hash for the lookup — no PII is read or logged here.
    const patient = await this.patientModel.findOne({
      where: { emailSearchHash: emailHash, doctorId } as WhereOptions,
      attributes: ['id'],
    });

    if (!patient) return [];

    const rows = await this.packageModel.findAll({
      where: { patientId: patient.id, doctorId, status: 'active' } as WhereOptions,
      order: [['createdAt', 'DESC']],
    });

    return rows.map((r) => this.toDomain(r));
  }

  async save(pkg: PatientPackage): Promise<PatientPackage> {
    const row = await this.packageModel.create({
      id: pkg.id,
      doctorId: pkg.doctorId,
      patientId: pkg.patientId,
      authUserId: pkg.authUserId,
      packageTemplateId: pkg.packageTemplateId,
      planName: pkg.planName,
      specialty: pkg.specialty,
      totalSessions: pkg.totalSessions,
      usedSessions: pkg.usedSessions,
      status: pkg.status,
      purchasedAmountUsd: pkg.purchasedAmountUsd,
      notifiedOneLeft: pkg.notifiedOneLeft,
    });
    return this.toDomain(row);
  }

  async listByDoctor(
    filters: import('../../../domain/repositories/package.repository').PackageListFilters,
  ): Promise<PatientPackage[]> {
    const where: Record<string, unknown> = { doctorId: filters.doctorId };
    if (filters.patientId) {
      where['patientId'] = filters.patientId;
    }
    if (filters.status) {
      where['status'] = filters.status;
    }

    const rows = await this.packageModel.findAll({
      where: where as WhereOptions,
      order: [['createdAt', 'DESC']],
    });
    return rows.map((r) => this.toDomain(r));
  }

  /**
   * Consume one session with an optimistic lock.
   *
   * The UPDATE atomically increments used_sessions and transitions status to
   * 'completed' when the last session is consumed. The WHERE clause on
   * used_sessions = :current prevents double-consumption under concurrency.
   *
   * Returns true when exactly 1 row was affected; false otherwise (concurrent
   * modification, already exhausted, or wrong status).
   */
  async consumeSessionOptimistic(
    packageId: string,
    currentUsedSessions: number,
    transaction?: import('sequelize').Transaction,
  ): Promise<boolean> {
    // QueryTypes.UPDATE returns [undefined, affectedCount: number] — no casting required.
    const [, affectedCount] = await this.sequelize.query(
      `UPDATE patient_packages
       SET used_sessions = used_sessions + 1,
           status = CASE
             WHEN used_sessions + 1 >= total_sessions THEN 'completed'
             ELSE 'active'
           END,
           updated_at = now()
       WHERE id            = :packageId
         AND used_sessions = :currentUsedSessions
         AND status        = 'active'`,
      {
        replacements: { packageId, currentUsedSessions },
        type: QueryTypes.UPDATE,
        transaction,
      },
    );

    return affectedCount === 1;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toDomain(row: PatientPackageModel): PatientPackage {
    return PatientPackage.create({
      id: row.id,
      doctorId: row.doctorId,
      patientId: row.patientId,
      authUserId: row.authUserId,
      packageTemplateId: row.packageTemplateId,
      planName: row.planName,
      specialty: row.specialty,
      totalSessions: Number(row.totalSessions),
      usedSessions: Number(row.usedSessions),
      status: row.status,
      purchasedAmountUsd: row.purchasedAmountUsd !== null ? Number(row.purchasedAmountUsd) : null,
      notifiedOneLeft: row.notifiedOneLeft,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
