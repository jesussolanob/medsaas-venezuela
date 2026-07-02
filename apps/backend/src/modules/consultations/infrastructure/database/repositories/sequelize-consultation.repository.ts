import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, UniqueConstraintError, type WhereOptions } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import type { PaymentStatus } from '@delta/shared-types';
import { Consultation } from '../../../domain/entities/consultation.entity';
import { ConsultationNotFoundError } from '../../../domain/errors/consultation-not-found.error';
import { ConsultationCodeConflictError } from '../../../domain/errors/consultation-code-conflict.error';
import { DecryptionError } from '../../../domain/errors/decryption.error';
import type {
  IConsultationRepository,
  ConsultationListFilters,
  ConsultationListResult,
} from '../../../domain/repositories/consultation.repository';
import { ConsultationModel } from '../models/consultation.model';
import { CryptoService } from '../../../../../infrastructure/crypto/crypto.service';

/**
 * Sequelize implementation of IConsultationRepository.
 *
 * ENCRYPTION BOUNDARY: all PHI encryption and decryption happens here.
 *   - On write: encrypt chief_complaint, diagnosis, treatment, notes.
 *   - On read: decrypt those fields before constructing the domain entity.
 *
 * The domain layer never sees ciphertext; it always works with plaintext values.
 *
 * TRANSACTIONS: update() and updatePayment() wrap the update+re-read pair inside
 * a serializable transaction to guarantee the returned entity reflects exactly
 * what was written, even under concurrent requests.
 *
 * RACE CONDITION: save() translates UniqueConstraintError on consultation_code
 * into ConsultationCodeConflictError so the use case can retry with the next
 * sequence number instead of crashing with a 500.
 */
@Injectable()
export class SequelizeConsultationRepository implements IConsultationRepository {
  constructor(
    @InjectModel(ConsultationModel)
    private readonly consultationModel: typeof ConsultationModel,
    private readonly crypto: CryptoService,
    private readonly sequelize: Sequelize,
  ) {}

  async findById(id: string, doctorId: string): Promise<Consultation | null> {
    const row = await this.consultationModel.findOne({
      where: { id, doctorId } as WhereOptions,
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  async findByCode(code: string): Promise<Consultation | null> {
    const row = await this.consultationModel.findOne({
      where: { consultationCode: code } as WhereOptions,
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  async countByDoctorAndMonth(doctorId: string, yearMonth: string): Promise<number> {
    // yearMonth format: 'YYYYMM' — match against consultation_code prefix 'DLT-YYYYMM-'
    const prefix = `DLT-${yearMonth}-`;
    return this.consultationModel.count({
      where: {
        doctorId,
        consultationCode: { [Op.like]: `${prefix}%` },
      } as WhereOptions,
    });
  }

  /**
   * Persists a new consultation.
   *
   * Translates UniqueConstraintError on consultation_code into
   * ConsultationCodeConflictError so the calling use case can retry with the
   * next sequence number — this is the correct fix for the race condition where
   * two concurrent requests pass the pre-check findByCode but only one wins the
   * INSERT. The DB UNIQUE constraint is the authoritative guard.
   */
  async save(consultation: Consultation): Promise<Consultation> {
    const encrypted = this.encryptClinicalFields(consultation);

    try {
      const row = await this.consultationModel.create({
        id: consultation.id,
        doctorId: consultation.doctorId,
        patientId: consultation.patientId,
        appointmentId: consultation.appointmentId,
        consultationCode: consultation.consultationCode,
        consultationDate: consultation.consultationDate,
        chiefComplaint: encrypted.chiefComplaint,
        diagnosis: encrypted.diagnosis,
        treatment: encrypted.treatment,
        notes: encrypted.notes,
        paymentStatus: consultation.paymentStatus,
        paymentMethod: consultation.paymentMethod,
        amount: consultation.amount,
        paymentDate: consultation.paymentDate,
        blocksSnapshot: consultation.blocksSnapshot,
      });

      return this.toDomain(row);
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        throw new ConsultationCodeConflictError(consultation.consultationCode);
      }
      throw err;
    }
  }

  /**
   * Partial update of clinical fields, wrapped in a transaction.
   *
   * The UPDATE + re-read happen atomically so the returned entity is guaranteed
   * to reflect the written state even under concurrent updates.
   *
   * blocksSnapshot is stored as JSONB in plaintext (Etapa 1).
   * ETAPA 2: cifrar blocks_snapshot (PHI) — diferido, igual que patient_messages.body
   */
  async update(
    id: string,
    doctorId: string,
    fields: Partial<
      Pick<Consultation, 'chiefComplaint' | 'diagnosis' | 'treatment' | 'notes' | 'blocksSnapshot'>
    >,
  ): Promise<Consultation> {
    const updateData: Record<string, unknown> = {};

    if (fields.chiefComplaint !== undefined) {
      updateData.chiefComplaint = fields.chiefComplaint
        ? this.crypto.encrypt(fields.chiefComplaint)
        : null;
    }
    if (fields.diagnosis !== undefined) {
      updateData.diagnosis = fields.diagnosis ? this.crypto.encrypt(fields.diagnosis) : null;
    }
    if (fields.treatment !== undefined) {
      updateData.treatment = fields.treatment ? this.crypto.encrypt(fields.treatment) : null;
    }
    if (fields.notes !== undefined) {
      updateData.notes = fields.notes ? this.crypto.encrypt(fields.notes) : null;
    }
    // blocksSnapshot: undefined → skip (partial update); null → clear; object → replace.
    // Stored as plain JSONB in Etapa 1 (no encryption applied).
    if (fields.blocksSnapshot !== undefined) {
      updateData.blocksSnapshot = fields.blocksSnapshot;
    }

    return this.sequelize.transaction(async (t) => {
      await this.consultationModel.update(updateData, {
        where: { id, doctorId } as WhereOptions,
        transaction: t,
      });

      const updated = await this.consultationModel.findOne({
        where: { id, doctorId } as WhereOptions,
        transaction: t,
      });
      if (!updated) {
        throw new ConsultationNotFoundError();
      }
      return this.toDomain(updated);
    });
  }

  /**
   * Updates payment fields, wrapped in a transaction.
   *
   * The UPDATE + re-read happen atomically so the returned entity is guaranteed
   * to reflect the written state even under concurrent requests.
   */
  async updatePayment(
    id: string,
    doctorId: string,
    fields: {
      paymentStatus: PaymentStatus;
      paymentMethod?: string | null;
      paymentDate?: Date | null;
      amount?: number | null;
    },
  ): Promise<Consultation> {
    const updateData: Record<string, unknown> = {
      paymentStatus: fields.paymentStatus,
    };
    if (fields.paymentMethod !== undefined) {
      updateData.paymentMethod = fields.paymentMethod;
    }
    if (fields.paymentDate !== undefined) {
      updateData.paymentDate = fields.paymentDate;
    }
    if (fields.amount !== undefined) {
      updateData.amount = fields.amount;
    }

    return this.sequelize.transaction(async (t) => {
      await this.consultationModel.update(updateData, {
        where: { id, doctorId } as WhereOptions,
        transaction: t,
      });

      const updated = await this.consultationModel.findOne({
        where: { id, doctorId } as WhereOptions,
        transaction: t,
      });
      if (!updated) {
        throw new ConsultationNotFoundError();
      }
      return this.toDomain(updated);
    });
  }

  async list(filters: ConsultationListFilters): Promise<ConsultationListResult> {
    const where: Record<string, unknown> = { doctorId: filters.doctorId };

    if (filters.paymentStatus) {
      where.paymentStatus = filters.paymentStatus;
    }
    if (filters.dateFrom || filters.dateTo) {
      const dateRange: Record<symbol, unknown> = {};
      if (filters.dateFrom) {
        dateRange[Op.gte] = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        dateRange[Op.lte] = new Date(filters.dateTo);
      }
      where.consultationDate = dateRange;
    }

    const offset = (filters.page - 1) * filters.limit;
    const { count, rows } = await this.consultationModel.findAndCountAll({
      where: where as WhereOptions,
      limit: filters.limit,
      offset,
      order: [['consultationDate', 'DESC']],
    });

    return {
      items: rows.map((r) => this.toDomain(r)),
      total: count as number,
      page: filters.page,
      limit: filters.limit,
    };
  }

  async findByPatient(
    patientId: string,
    doctorId: string,
    page: number,
    limit: number,
  ): Promise<ConsultationListResult> {
    const offset = (page - 1) * limit;
    const { count, rows } = await this.consultationModel.findAndCountAll({
      where: { patientId, doctorId } as WhereOptions,
      limit,
      offset,
      order: [['consultationDate', 'DESC']],
    });

    return {
      items: rows.map((r) => this.toDomain(r)),
      total: count as number,
      page,
      limit,
    };
  }

  async findByAppointmentId(
    appointmentId: string,
    doctorId: string,
  ): Promise<import('../../../domain/entities/consultation.entity').Consultation | null> {
    const row = await this.consultationModel.findOne({
      where: { appointmentId, doctorId } as WhereOptions,
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  async deleteById(id: string): Promise<void> {
    await this.consultationModel.destroy({ where: { id } as WhereOptions });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private encryptClinicalFields(consultation: Consultation): {
    chiefComplaint: string | null;
    diagnosis: string | null;
    treatment: string | null;
    notes: string | null;
  } {
    return {
      chiefComplaint: consultation.chiefComplaint
        ? this.crypto.encrypt(consultation.chiefComplaint)
        : null,
      diagnosis: consultation.diagnosis ? this.crypto.encrypt(consultation.diagnosis) : null,
      treatment: consultation.treatment ? this.crypto.encrypt(consultation.treatment) : null,
      notes: consultation.notes ? this.crypto.encrypt(consultation.notes) : null,
    };
  }

  private toDomain(row: ConsultationModel): Consultation {
    return Consultation.create({
      id: row.id,
      doctorId: row.doctorId,
      patientId: row.patientId,
      appointmentId: row.appointmentId,
      consultationCode: row.consultationCode,
      consultationDate: row.consultationDate,
      chiefComplaint: this.safeDecrypt(row.chiefComplaint, 'chief_complaint'),
      diagnosis: this.safeDecrypt(row.diagnosis, 'diagnosis'),
      treatment: this.safeDecrypt(row.treatment, 'treatment'),
      notes: this.safeDecrypt(row.notes, 'notes'),
      paymentStatus: row.paymentStatus as 'pending' | 'approved',
      paymentMethod: row.paymentMethod,
      amount: row.amount !== null ? Number(row.amount) : null,
      paymentDate: row.paymentDate,
      blocksSnapshot: row.blocksSnapshot,
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
