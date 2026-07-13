import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes, UniqueConstraintError, type WhereOptions } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import type { PaymentStatus } from '@delta/shared-types';
import { Consultation } from '../../../domain/entities/consultation.entity';
import type { BlockDefinition } from '../../../domain/entities/consultation.entity';
import { ConsultationExtraItem } from '../../../domain/entities/consultation-extra-item.entity';
import { ConsultationNotFoundError } from '../../../domain/errors/consultation-not-found.error';
import { ConsultationCodeConflictError } from '../../../domain/errors/consultation-code-conflict.error';
import { DecryptionError } from '../../../domain/errors/decryption.error';
import type {
  IConsultationRepository,
  ConsultationListFilters,
  ConsultationListResult,
  ConsultationWithAppointmentRow,
} from '../../../domain/repositories/consultation.repository';
import { ConsultationModel } from '../models/consultation.model';
import { ConsultationExtraItemModel } from '../models/consultation-extra-item.model';
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
  base_amount: string | null;
  payment_date: string | null;
  payment_reference: string | null;
  payment_receipt_url: string | null;
  blocks_snapshot: Record<string, unknown> | null;
  blocks_structure: BlockDefinition[] | null;
  created_at: string;
  updated_at: string;
  /** Encrypted full_name from the patients table — null when no patient row matched. */
  patient_full_name_enc: string | null;
  /** Status from the linked appointments row — null when consultation has no appointment. */
  appointment_status: string | null;
}

/** Raw row returned by queries against consultation_extra_items. */
interface ExtraItemRow {
  id: string;
  consultation_id: string;
  doctor_id: string;
  description: string;
  amount_usd: string;
  created_at: string;
}

/**
 * Raw row returned by listWithAppointment() — billing projection
 * with appointment enrichment fields and COALESCE amount.
 */
interface ConsultationWithAppointmentRaw {
  id: string;
  consultation_code: string;
  consultation_date: string;
  patient_id: string;
  payment_status: string;
  /** COALESCE(c.amount, a.plan_price, 0) as text from Postgres DECIMAL. */
  amount_usd: string;
  scheduled_at: string | null;
  appointment_mode: string | null;
  duration_minutes: string | null;
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
    @InjectModel(ConsultationExtraItemModel)
    private readonly extraItemModel: typeof ConsultationExtraItemModel,
    private readonly crypto: CryptoService,
    private readonly sequelize: Sequelize,
  ) {}

  async findById(id: string, doctorId: string): Promise<Consultation | null> {
    const rows = await this.sequelize.query<ConsultationEnrichedRow>(
      `SELECT
         c.id, c.doctor_id, c.patient_id, c.appointment_id, c.consultation_code,
         c.consultation_date, c.chief_complaint, c.diagnosis, c.treatment, c.notes,
         c.payment_status, c.payment_method, c.amount, c.base_amount, c.payment_date,
         c.payment_reference, c.payment_receipt_url,
         c.blocks_snapshot, c.blocks_structure, c.created_at, c.updated_at,
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

    // Load extra items for the detail view so the frontend modal can pre-populate.
    const extras = await this.loadExtraItems(id, doctorId);
    return this.toDomainEnriched(row, extras);
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

  async getMaxSequenceForMonth(yearMonth: string): Promise<number> {
    // Máximo del sufijo NNNN entre TODOS los códigos DLT-YYYYMM-NNNN del mes
    // (global: el UNIQUE de consultation_code es global). Sembrar la próxima
    // secuencia desde aquí evita colisiones cuando el mes ya tiene códigos con huecos.
    const rows = await this.sequelize.query<{ max_seq: string | null }>(
      `SELECT COALESCE(
                MAX((substring(consultation_code from '^DLT-[0-9]{6}-([0-9]+)$'))::int),
                0
              )::text AS max_seq
         FROM consultations
        WHERE consultation_code LIKE :prefix`,
      { replacements: { prefix: `DLT-${yearMonth}-%` }, type: QueryTypes.SELECT },
    );
    const raw = rows[0]?.max_seq;
    const parsed = raw != null ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
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
        paymentReference: consultation.paymentReference,
        paymentReceiptUrl: consultation.paymentReceiptUrl,
        blocksSnapshot: consultation.blocksSnapshot,
        blocksStructure: consultation.blocksStructure,
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
      Pick<
        Consultation,
        | 'chiefComplaint'
        | 'diagnosis'
        | 'treatment'
        | 'notes'
        | 'blocksSnapshot'
        | 'blocksStructure'
      >
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
    // blocksStructure: undefined → skip; null → clear; array → replace.
    // Stored as plain JSONB — block definitions are not PHI.
    if (fields.blocksStructure !== undefined) {
      updateData.blocksStructure = fields.blocksStructure;
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

  /**
   * Partial update of payment detail fields (status, method, reference, receiptUrl, amount).
   * No PaymentAlreadyApproved guard — these fields are always editable.
   *
   * Undefined semantics:
   *   - undefined → not included in the UPDATE (field untouched)
   *   - null      → written as NULL in the DB (field cleared)
   *   - value     → replaced with the provided value
   *
   * paymentDate auto-set: if paymentStatus === 'approved' the method sets paymentDate
   * to new Date() so the approval timestamp is always recorded.
   * If the status transitions back to 'pending', paymentDate is left unchanged
   * (preserving audit history).
   */
  async updatePaymentDetails(
    id: string,
    doctorId: string,
    patch: {
      paymentStatus?: PaymentStatus;
      paymentMethod?: string | null;
      paymentReference?: string | null;
      paymentReceiptUrl?: string | null;
      amount?: number | null;
    },
  ): Promise<Consultation> {
    const updateData: Record<string, unknown> = {};

    if (patch.paymentStatus !== undefined) {
      updateData.paymentStatus = patch.paymentStatus;
      // Auto-record approval timestamp when transitioning to approved.
      if (patch.paymentStatus === 'approved') {
        updateData.paymentDate = new Date();
      }
    }
    if (patch.paymentMethod !== undefined) {
      updateData.paymentMethod = patch.paymentMethod;
    }
    if (patch.paymentReference !== undefined) {
      updateData.paymentReference = patch.paymentReference;
    }
    if (patch.paymentReceiptUrl !== undefined) {
      updateData.paymentReceiptUrl = patch.paymentReceiptUrl;
    }
    if (patch.amount !== undefined) {
      updateData.amount = patch.amount;
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

      // Sync the linked payments row (if any) so Cobros stays consistent.
      // The payment is located via: appointments.payment_id WHERE appointments.consultation_id = id.
      // When no payment row is linked (consultation created directly), this is a no-op.
      // SECURITY: AND pp.doctor_id = :doctorId ensures the UPDATE is always scoped to the owner.
      const newStatus = patch.paymentStatus;
      const syncFields: string[] = ['updated_at = now()'];
      const syncReplacements: Record<string, unknown> = { consultationId: id, doctorId };

      if (newStatus !== undefined) {
        syncFields.push('status = :status');
        syncReplacements['status'] = newStatus;
        if (newStatus === 'approved') {
          // Set paid_at only when it was NULL (preserve existing approval timestamp).
          syncFields.push('paid_at = COALESCE(paid_at, now())');
        }
      }
      if (patch.amount !== undefined && patch.amount !== null) {
        syncFields.push('amount_usd = :amountUsd');
        syncReplacements['amountUsd'] = patch.amount;
      }
      if (patch.paymentMethod !== undefined) {
        syncFields.push('method_snapshot = :methodSnapshot');
        syncReplacements['methodSnapshot'] = patch.paymentMethod;
      }
      if (patch.paymentReference !== undefined) {
        syncFields.push('payment_reference = :paymentReference');
        syncReplacements['paymentReference'] = patch.paymentReference;
      }
      if (patch.paymentReceiptUrl !== undefined) {
        syncFields.push('payment_receipt_url = :paymentReceiptUrl');
        syncReplacements['paymentReceiptUrl'] = patch.paymentReceiptUrl;
      }

      await this.sequelize.query(
        `UPDATE payments pp
           SET ${syncFields.join(', ')}
           FROM appointments ap
           WHERE ap.payment_id      = pp.id
             AND ap.consultation_id = :consultationId
             AND pp.doctor_id       = :doctorId`,
        { replacements: syncReplacements, type: QueryTypes.UPDATE, transaction: t },
      );

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

    // Whitelisted ORDER BY clauses — values are never interpolated from raw user input.
    // Each entry is a static SQL fragment; the map key is compared with === at runtime.
    const ORDER_BY_MAP: Record<string, string> = {
      consultation_date: 'c.consultation_date DESC, c.id DESC',
      created_at: 'c.created_at DESC, c.id DESC',
      consultation_status: `CASE WHEN a.status = 'completed' THEN 0 WHEN a.status = 'no_show' THEN 1 ELSE 2 END ASC, c.consultation_date DESC, c.id DESC`,
      confirmation_status: `CASE WHEN a.status = 'confirmed' THEN 0 WHEN a.status = 'scheduled' THEN 1 ELSE 2 END ASC, c.consultation_date DESC, c.id DESC`,
    };

    const sortKey =
      filters.sort && Object.prototype.hasOwnProperty.call(ORDER_BY_MAP, filters.sort)
        ? filters.sort
        : 'consultation_date';
    const orderBy = ORDER_BY_MAP[sortKey];

    // LIST query with LEFT JOIN to enrich patient_name and appointment_status.
    // base_amount is included for the list view (needed by some finance consumers).
    // Extra items are NOT loaded for list queries — too expensive (N+1 per row).
    const rows = await this.sequelize.query<ConsultationEnrichedRow>(
      `SELECT
         c.id, c.doctor_id, c.patient_id, c.appointment_id, c.consultation_code,
         c.consultation_date, c.chief_complaint, c.diagnosis, c.treatment, c.notes,
         c.payment_status, c.payment_method, c.amount, c.base_amount, c.payment_date,
         c.payment_reference, c.payment_receipt_url,
         c.blocks_snapshot, c.blocks_structure, c.created_at, c.updated_at,
         p.full_name AS patient_full_name_enc,
         a.status    AS appointment_status
       FROM consultations c
       LEFT JOIN patients     p ON p.id = c.patient_id
       LEFT JOIN appointments a ON a.id = c.appointment_id
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT :limit OFFSET :offset`,
      {
        replacements: { ...replacements, limit: filters.limit, offset },
        type: QueryTypes.SELECT,
      },
    );

    return {
      items: rows.map((r) => this.toDomainEnriched(r, [])),
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

  /**
   * Atomically approves a consultation payment with extra service items.
   *
   * Transaction semantics (all-or-nothing):
   *   1. Read the current consultation row to resolve `base_amount` (first approval
   *      only: set to COALESCE(current amount, plan_price via appointments, 0)).
   *   2. Delete all existing extra items for this consultation.
   *   3. Bulk-insert the new extras.
   *   4. Recompute total = base_amount + Σ(extras.amount_usd).
   *   5. Update consultations: amount = total, payment_status = 'approved',
   *      payment_method (if provided), payment_date = NOW().
   *   6. Return the updated Consultation entity with extraItems populated.
   *
   * Anti-double-count: base_amount is written only on the first approval
   * (when base_amount IS NULL in the DB). Re-approvals read the stored base_amount.
   */
  async approveWithExtras(
    id: string,
    doctorId: string,
    extras: Array<{ description: string; amountUsd: number }>,
    paymentMethod?: string | null,
  ): Promise<Consultation> {
    return this.sequelize.transaction(async (t) => {
      // Step 1 — Resolve base amount inside the transaction for a consistent read.
      const baseRows = await this.sequelize.query<{
        base_amount: string | null;
        amount: string | null;
        plan_price: string | null;
      }>(
        `SELECT c.base_amount, c.amount, a.plan_price
           FROM consultations c
           LEFT JOIN appointments a ON a.id = c.appointment_id
           WHERE c.id = :id AND c.doctor_id = :doctorId
           LIMIT 1`,
        { replacements: { id, doctorId }, type: QueryTypes.SELECT, transaction: t },
      );

      const baseRow = baseRows[0];
      if (!baseRow) {
        throw new ConsultationNotFoundError();
      }

      // On first approval, fix base_amount from COALESCE(current amount, plan_price, 0).
      // On re-approval use the already-stored base_amount unchanged.
      const resolvedBase =
        baseRow.base_amount !== null
          ? parseFloat(baseRow.base_amount)
          : parseFloat(baseRow.amount ?? baseRow.plan_price ?? '0');

      // Step 2 — Delete all previous extra items.
      await this.extraItemModel.destroy({
        where: { consultationId: id } as WhereOptions,
        transaction: t,
      });

      // Step 3 — Insert new extras.
      const now = new Date();
      const extraRecords = extras.map((e) => ({
        id: randomUUID(),
        consultationId: id,
        doctorId,
        description: e.description.trim(),
        amountUsd: e.amountUsd,
        createdAt: now,
      }));

      if (extraRecords.length > 0) {
        await this.extraItemModel.bulkCreate(extraRecords, { transaction: t });
      }

      // Step 4 — Compute total.
      const extrasSum = extras.reduce((acc, e) => acc + e.amountUsd, 0);
      const total = parseFloat((resolvedBase + extrasSum).toFixed(2));

      // Step 5 — Update the consultation row.
      const updateData: Record<string, unknown> = {
        amount: total,
        paymentStatus: 'approved' as PaymentStatus,
        paymentDate: now,
      };
      // base_amount is only set on first approval (when it was NULL).
      if (baseRow.base_amount === null) {
        updateData.baseAmount = resolvedBase;
      }
      if (paymentMethod !== undefined) {
        updateData.paymentMethod = paymentMethod;
      }

      await this.consultationModel.update(updateData, {
        where: { id, doctorId } as WhereOptions,
        transaction: t,
      });

      // Step 5b — Sync the linked payments row so Cobros stays consistent.
      // Locate via: appointments.payment_id WHERE appointments.consultation_id = id.
      // No-op when no linked payment exists (consultation created directly).
      // SECURITY: AND pp.doctor_id = :doctorId ensures the UPDATE is always scoped to the owner.
      const paymentSyncFields: string[] = [
        'status = :approvedStatus',
        'paid_at = COALESCE(paid_at, now())',
        'amount_usd = :total',
        'updated_at = now()',
      ];
      const paymentSyncReplacements: Record<string, unknown> = {
        consultationId: id,
        doctorId,
        approvedStatus: 'approved',
        total,
      };
      if (paymentMethod !== undefined) {
        paymentSyncFields.push('method_snapshot = :methodSnapshot');
        paymentSyncReplacements['methodSnapshot'] = paymentMethod;
      }

      await this.sequelize.query(
        `UPDATE payments pp
           SET ${paymentSyncFields.join(', ')}
           FROM appointments ap
           WHERE ap.payment_id      = pp.id
             AND ap.consultation_id = :consultationId
             AND pp.doctor_id       = :doctorId`,
        { replacements: paymentSyncReplacements, type: QueryTypes.UPDATE, transaction: t },
      );

      // Step 6 — Re-read the updated consultation inside the transaction.
      const updatedRows = await this.sequelize.query<ConsultationEnrichedRow>(
        `SELECT
           c.id, c.doctor_id, c.patient_id, c.appointment_id, c.consultation_code,
           c.consultation_date, c.chief_complaint, c.diagnosis, c.treatment, c.notes,
           c.payment_status, c.payment_method, c.amount, c.base_amount, c.payment_date,
           c.payment_reference, c.payment_receipt_url,
           c.blocks_snapshot, c.blocks_structure, c.created_at, c.updated_at,
           p.full_name AS patient_full_name_enc,
           a.status    AS appointment_status
         FROM consultations c
         LEFT JOIN patients     p ON p.id = c.patient_id
         LEFT JOIN appointments a ON a.id = c.appointment_id
         WHERE c.id = :id AND c.doctor_id = :doctorId
         LIMIT 1`,
        { replacements: { id, doctorId }, type: QueryTypes.SELECT, transaction: t },
      );

      const updatedRow = updatedRows[0];
      if (!updatedRow) {
        throw new ConsultationNotFoundError();
      }

      // Build extra item entities from the freshly inserted records.
      const extraItemEntities = extraRecords.map((r) =>
        ConsultationExtraItem.create({
          id: r.id,
          consultationId: r.consultationId,
          doctorId: r.doctorId,
          description: r.description,
          amountUsd: r.amountUsd,
          createdAt: r.createdAt,
        }),
      );

      return this.toDomainEnriched(updatedRow, extraItemEntities);
    });
  }

  async findExtraItems(consultationId: string, doctorId: string): Promise<ConsultationExtraItem[]> {
    return this.loadExtraItems(consultationId, doctorId);
  }

  /**
   * Billing read for the /consultations/with-patient endpoint.
   *
   * Joins appointments to surface scheduled_at, appointment_mode, and
   * duration_minutes. Uses COALESCE(c.amount, a.plan_price, 0) so that:
   *   - approved consultations carry their confirmed total (including extras).
   *   - pending consultations fall back to the booking plan_price.
   *   - consultations with neither show $0 rather than null.
   *
   * Only non-PHI fields are projected here. Patient name/phone/email are
   * resolved in the use-case layer via the patient repository (owner-scoped).
   *
   * SECURITY: scoped to doctorId — anti-IDOR.
   */
  async listWithAppointment(filters: {
    doctorId: string;
    limit: number;
  }): Promise<ConsultationWithAppointmentRow[]> {
    const rows = await this.sequelize.query<ConsultationWithAppointmentRaw>(
      `SELECT
         c.id,
         c.consultation_code,
         c.consultation_date,
         c.patient_id,
         c.payment_status,
         COALESCE(c.amount, a.plan_price, 0)::text AS amount_usd,
         a.scheduled_at,
         a.appointment_mode,
         a.duration_minutes
       FROM consultations c
       LEFT JOIN appointments a ON a.id = c.appointment_id
       WHERE c.doctor_id = :doctorId
       ORDER BY c.consultation_date DESC
       LIMIT :limit`,
      {
        replacements: { doctorId: filters.doctorId, limit: filters.limit },
        type: QueryTypes.SELECT,
      },
    );

    return rows.map((r) => ({
      id: r.id,
      consultationCode: r.consultation_code,
      consultationDate: new Date(r.consultation_date),
      patientId: r.patient_id,
      paymentStatus: r.payment_status as 'pending' | 'approved',
      amountUsd: parseFloat(r.amount_usd),
      scheduledAt: r.scheduled_at ? new Date(r.scheduled_at) : null,
      appointmentMode: r.appointment_mode,
      durationMinutes: r.duration_minutes !== null ? parseInt(r.duration_minutes, 10) : null,
    }));
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Loads extra items for a consultation, scoped to doctorId (anti-IDOR).
   * Returns an empty array when there are no items.
   */
  private async loadExtraItems(
    consultationId: string,
    doctorId: string,
  ): Promise<ConsultationExtraItem[]> {
    const rows = await this.sequelize.query<ExtraItemRow>(
      `SELECT id, consultation_id, doctor_id, description, amount_usd, created_at
         FROM consultation_extra_items
         WHERE consultation_id = :consultationId AND doctor_id = :doctorId
         ORDER BY created_at ASC`,
      { replacements: { consultationId, doctorId }, type: QueryTypes.SELECT },
    );

    return rows.map((r) =>
      ConsultationExtraItem.create({
        id: r.id,
        consultationId: r.consultation_id,
        doctorId: r.doctor_id,
        description: r.description,
        amountUsd: parseFloat(r.amount_usd),
        createdAt: new Date(r.created_at),
      }),
    );
  }

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
      baseAmount: row.baseAmount !== null ? Number(row.baseAmount) : null,
      paymentDate: row.paymentDate,
      paymentReference: row.paymentReference,
      paymentReceiptUrl: row.paymentReceiptUrl,
      blocksSnapshot: row.blocksSnapshot,
      blocksStructure: (row.blocksStructure as BlockDefinition[] | null) ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      extraItems: [],
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
   * Populates patientName (decrypted), appointmentStatus, and extraItems.
   *
   * @param extras - Pre-loaded extra items for this consultation. Pass [] for list
   *   queries where extras are not loaded (avoids N+1). Pass the loaded array for
   *   findById and approveWithExtras responses.
   */
  private toDomainEnriched(
    row: ConsultationEnrichedRow,
    extras: ConsultationExtraItem[] = [],
  ): Consultation {
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
      baseAmount: row.base_amount !== null ? Number(row.base_amount) : null,
      paymentDate: row.payment_date ? new Date(row.payment_date) : null,
      paymentReference: row.payment_reference,
      paymentReceiptUrl: row.payment_receipt_url,
      blocksSnapshot: row.blocks_snapshot as Record<string, unknown> | null,
      blocksStructure: (row.blocks_structure as BlockDefinition[] | null) ?? null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      patientName,
      appointmentStatus: row.appointment_status ?? null,
      extraItems: extras,
    });
  }
}
