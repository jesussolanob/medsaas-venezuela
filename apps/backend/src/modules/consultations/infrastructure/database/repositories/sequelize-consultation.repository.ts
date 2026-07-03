import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes, UniqueConstraintError, type WhereOptions } from 'sequelize';
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
 * Raw row shape returned by the enriched JOIN queries for list() and findById().
 * Column names follow snake_case (raw SQL result from Sequelize QueryTypes.SELECT).
 */
interface ConsultationEnrichedRow {
  id: string;
  doctor_id: string;
  patient_id: string;
  appointment_id: string | null;
  consultation_code: string;
  consultation_date: string;
  chief_complaint: string | null;
  diagnosis: string | null;
  treatment: string | null;
  notes: string | null;
  payment_status: string;
  payment_method: string | null;
  amount: string | null;
  payment_date: string | null;
  blocks_snapshot: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  /** Encrypted full_name from the patients table — null when no patient row matched. */
  patient_full_name_enc: string | null;
  /** Status from the linked appointments row — null when consultation has no appointment. */
  appointment_status: string | null;
}

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
    const rows = await this.sequelize.query<ConsultationEnrichedRow>(
      `SELECT
         c.id, c.doctor_id, c.patient_id, c.appointment_id, c.consultation_code,
         c.consultation_date, c.chief_complaint, c.diagnosis, c.treatment, c.notes,
         c.payment_status, c.payment_method, c.amount, c.payment_date,
         c.blocks_snapshot, c.created_at, c.updated_at,
         p.full_name AS patient_full_name_enc,
         a.status    AS appointment_status
       FROM consultations c
       LEFT JOIN patients     p ON p.id = c.patient_id
       LEFT JOIN appointments a ON a.id = c.appointment_id
       WHERE c.id = :id AND c.doctor_id = :doctorId
       LIMIT 1`,
      { replacements: { id, doctorId }, type: QueryTypes.SELECT },
    );
    const row = rows[0];
    if (!row) return null;
    return this.toDomainEnriched(row);
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
    // Build WHERE conditions dynamically
    const conditions: string[] = ['c.doctor_id = :doctorId'];
    const replacements: Record<string, unknown> = { doctorId: filters.doctorId };

    if (filters.paymentStatus) {
      conditions.push('c.payment_status = :paymentStatus');
      replacements['paymentStatus'] = filters.paymentStatus;
    }
    if (filters.dateFrom) {
      conditions.push('c.consultation_date >= :dateFrom::timestamptz');
      replacements['dateFrom'] = filters.dateFrom;
    }
    if (filters.dateTo) {
      conditions.push('c.consultation_date <= :dateTo::timestamptz');
      replacements['dateTo'] = filters.dateTo;
    }

    const where = conditions.join(' AND ');
    const offset = (filters.page - 1) * filters.limit;

    // COUNT query (no JOIN needed — avoids inflating count via LEFT JOIN)
    const countRows = await this.sequelize.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM consultations c WHERE ${where}`,
      { replacements, type: QueryTypes.SELECT },
    );
    const total = parseInt(countRows[0]?.cnt ?? '0', 10);

    // LIST query with LEFT JOIN to enrich patient_name and appointment_status
    const rows = await this.sequelize.query<ConsultationEnrichedRow>(
      `SELECT
         c.id, c.doctor_id, c.patient_id, c.appointment_id, c.consultation_code,
         c.consultation_date, c.chief_complaint, c.diagnosis, c.treatment, c.notes,
         c.payment_status, c.payment_method, c.amount, c.payment_date,
         c.blocks_snapshot, c.created_at, c.updated_at,
         p.full_name AS patient_full_name_enc,
         a.status    AS appointment_status
       FROM consultations c
       LEFT JOIN patients     p ON p.id = c.patient_id
       LEFT JOIN appointments a ON a.id = c.appointment_id
       WHERE ${where}
       ORDER BY c.consultation_date DESC
       LIMIT :limit OFFSET :offset`,
      {
        replacements: { ...replacements, limit: filters.limit, offset },
        type: QueryTypes.SELECT,
      },
    );

    return {
      items: rows.map((r) => this.toDomainEnriched(r)),
      total,
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

  /**
   * Maps a raw enriched SQL row (from JOIN queries) to a Consultation entity.
   * Populates patientName (decrypted) and appointmentStatus from JOIN columns.
   */
  private toDomainEnriched(row: ConsultationEnrichedRow): Consultation {
    const patientName = row.patient_full_name_enc
      ? this.safeDecrypt(row.patient_full_name_enc, 'full_name')
      : null;

    return Consultation.create({
      id: row.id,
      doctorId: row.doctor_id,
      patientId: row.patient_id,
      appointmentId: row.appointment_id,
      consultationCode: row.consultation_code,
      consultationDate: new Date(row.consultation_date),
      chiefComplaint: this.safeDecrypt(row.chief_complaint, 'chief_complaint'),
      diagnosis: this.safeDecrypt(row.diagnosis, 'diagnosis'),
      treatment: this.safeDecrypt(row.treatment, 'treatment'),
      notes: this.safeDecrypt(row.notes, 'notes'),
      paymentStatus: row.payment_status as 'pending' | 'approved',
      paymentMethod: row.payment_method,
      amount: row.amount !== null ? Number(row.amount) : null,
      paymentDate: row.payment_date ? new Date(row.payment_date) : null,
      blocksSnapshot: row.blocks_snapshot as Record<string, unknown> | null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      patientName,
      appointmentStatus: row.appointment_status ?? null,
    });
  }
}
