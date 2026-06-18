import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import type { WhereOptions } from 'sequelize';
import { EhrRecord } from '../../../domain/entities/ehr-record.entity';
import { EhrRecordNotFoundError } from '../../../domain/errors/ehr-record-not-found.error';
import { DecryptionError } from '../../../domain/errors/decryption.error';
import type { IEhrRepository } from '../../../domain/repositories/ehr.repository';
import { EhrRecordModel } from '../models/ehr-record.model';
import { CryptoService } from '../../../../../infrastructure/crypto/crypto.service';

/**
 * Sequelize implementation of IEhrRepository.
 *
 * ENCRYPTION BOUNDARY: all PHI encryption and decryption happens here.
 *   - On write: encrypt diagnosis, treatment_plan.
 *   - On read: decrypt those fields before constructing the domain entity.
 *
 * The domain layer never sees ciphertext; it always works with plaintext values.
 */
@Injectable()
export class SequelizeEhrRepository implements IEhrRepository {
  constructor(
    @InjectModel(EhrRecordModel)
    private readonly ehrModel: typeof EhrRecordModel,
    private readonly crypto: CryptoService,
    private readonly sequelize: Sequelize,
  ) {}

  async findById(id: string, doctorId: string): Promise<EhrRecord | null> {
    const row = await this.ehrModel.findOne({
      where: { id, doctorId } as WhereOptions,
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  async findByConsultation(consultationId: string, doctorId: string): Promise<EhrRecord | null> {
    const row = await this.ehrModel.findOne({
      where: { consultationId, doctorId } as WhereOptions,
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  async findByPatient(patientId: string, doctorId: string): Promise<EhrRecord[]> {
    const rows = await this.ehrModel.findAll({
      where: { patientId, doctorId } as WhereOptions,
      order: [['createdAt', 'DESC']],
    });
    return rows.map((r) => this.toDomain(r));
  }

  async save(record: EhrRecord): Promise<EhrRecord> {
    const row = await this.ehrModel.create({
      id: record.id,
      doctorId: record.doctorId,
      patientId: record.patientId,
      consultationId: record.consultationId,
      diagnosis: record.diagnosis ? this.crypto.encrypt(record.diagnosis) : null,
      treatmentPlan: record.treatmentPlan ? this.crypto.encrypt(record.treatmentPlan) : null,
    });
    return this.toDomain(row);
  }

  /**
   * Partial update of clinical fields, wrapped in a transaction.
   *
   * The UPDATE + re-read happen atomically so the returned entity is guaranteed
   * to reflect the written state even under concurrent updates.
   */
  async update(
    id: string,
    doctorId: string,
    fields: Partial<Pick<EhrRecord, 'diagnosis' | 'treatmentPlan'>>,
  ): Promise<EhrRecord> {
    const updateData: Record<string, unknown> = {};

    if (fields.diagnosis !== undefined) {
      updateData.diagnosis = fields.diagnosis ? this.crypto.encrypt(fields.diagnosis) : null;
    }
    if (fields.treatmentPlan !== undefined) {
      updateData.treatmentPlan = fields.treatmentPlan
        ? this.crypto.encrypt(fields.treatmentPlan)
        : null;
    }

    return this.sequelize.transaction(async (t) => {
      await this.ehrModel.update(updateData, {
        where: { id, doctorId } as WhereOptions,
        transaction: t,
      });

      const updated = await this.ehrModel.findOne({
        where: { id, doctorId } as WhereOptions,
        transaction: t,
      });
      if (!updated) {
        throw new EhrRecordNotFoundError();
      }
      return this.toDomain(updated);
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toDomain(row: EhrRecordModel): EhrRecord {
    return EhrRecord.create({
      id: row.id,
      doctorId: row.doctorId,
      patientId: row.patientId,
      consultationId: row.consultationId,
      diagnosis: this.safeDecrypt(row.diagnosis, 'diagnosis'),
      treatmentPlan: this.safeDecrypt(row.treatmentPlan, 'treatment_plan'),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  /**
   * Decrypts a nullable ciphertext field and wraps any crypto error in a
   * typed DomainError so GlobalExceptionFilter returns 422 (not 500).
   *
   * The field name in the error message never contains PHI — it is only the
   * column name, which is safe for logs and client error responses.
   */
  private safeDecrypt(value: string | null, field: string): string | null {
    if (!value) return null;
    try {
      return this.crypto.decrypt(value);
    } catch {
      throw new DecryptionError(field);
    }
  }
}
