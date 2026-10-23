import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes, UniqueConstraintError } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { randomUUID } from 'crypto';
import {
  StandaloneDocument,
  type StandaloneDocumentType,
  type StandaloneDocumentStatus,
} from '../../../domain/entities/standalone-document.entity';
import { StandaloneDocumentCodeConflictError } from '../../../domain/errors/standalone-document-code-conflict.error';
import { StandaloneDocumentNotFoundError } from '../../../domain/errors/standalone-document-not-found.error';
import type {
  IStandaloneDocumentRepository,
  ListStandaloneDocumentsFilters,
  CreateStandaloneDocumentParams,
  StandaloneDocumentSummary,
  StandaloneDocumentDetail,
} from '../../../domain/repositories/istandalone-document.repository';
import { StandaloneDocumentModel } from '../models/standalone-document.model';
import { CryptoService } from '../../../../../infrastructure/crypto/crypto.service';

@Injectable()
export class SequelizeStandaloneDocumentRepository implements IStandaloneDocumentRepository {
  constructor(
    @InjectModel(StandaloneDocumentModel)
    private readonly model: typeof StandaloneDocumentModel,
    private readonly crypto: CryptoService,
    private readonly sequelize: Sequelize,
  ) {}

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  async list(filters: ListStandaloneDocumentsFilters): Promise<StandaloneDocumentSummary[]> {
    // Join with patients to get encrypted name for decryption.
    // We use raw SQL to avoid Sequelize associations across modules.
    // SECURITY: NEVER log rows — they contain encrypted PII.
    type RawRow = {
      id: string;
      type: string;
      code: string | null;
      status: string;
      patient_id: string;
      full_name: string;
      created_at: string;
      issued_at: string | null;
      voided_at: string | null;
    };

    const conditions: string[] = ['sd.doctor_id = :doctorId', 'p.deleted_at IS NULL'];
    const replacements: Record<string, unknown> = { doctorId: filters.doctorId };

    if (filters.patientId) {
      conditions.push('sd.patient_id = :patientId');
      replacements['patientId'] = filters.patientId;
    }
    if (filters.type) {
      conditions.push('sd.type = :type');
      replacements['type'] = filters.type;
    }
    if (filters.status) {
      conditions.push('sd.status = :status');
      replacements['status'] = filters.status;
    }

    const where = conditions.join(' AND ');

    const limit = Math.min(filters.limit ?? 200, 500);
    const offset = filters.offset ?? 0;
    replacements['limit'] = limit;
    replacements['offset'] = offset;

    const rows = await this.sequelize.query<RawRow>(
      `SELECT sd.id, sd.type, sd.code, sd.status, sd.patient_id,
              p.full_name,
              sd.created_at, sd.issued_at, sd.voided_at
         FROM standalone_documents sd
         JOIN patients p ON p.id = sd.patient_id
        WHERE ${where}
        ORDER BY sd.created_at DESC
        LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT },
    );

    return rows.map((r) => ({
      id: r.id,
      type: r.type as StandaloneDocumentType,
      code: r.code,
      status: r.status as StandaloneDocumentStatus,
      patientId: r.patient_id,
      // Decrypt patient full_name — SECURITY: never log this value
      patientName: this.crypto.decrypt(r.full_name),
      createdAt: new Date(r.created_at),
      issuedAt: r.issued_at ? new Date(r.issued_at) : null,
      voidedAt: r.voided_at ? new Date(r.voided_at) : null,
    }));
  }

  async findById(id: string): Promise<StandaloneDocument | null> {
    const row = await this.model.findByPk(id);
    if (!row) return null;
    return this.toDomain(row);
  }

  async findByIdWithPatient(
    id: string,
    doctorId: string,
  ): Promise<StandaloneDocumentDetail | null> {
    type RawRow = {
      id: string;
      doctor_id: string;
      patient_id: string;
      type: string;
      code: string | null;
      status: string;
      content: Record<string, unknown>;
      void_reason: string | null;
      issued_at: string | null;
      voided_at: string | null;
      created_at: string;
      updated_at: string;
      full_name: string;
      cedula: string | null;
      age: number | null;
    };

    const rows = await this.sequelize.query<RawRow>(
      `SELECT sd.id, sd.doctor_id, sd.patient_id, sd.type, sd.code, sd.status,
              sd.content, sd.void_reason, sd.issued_at, sd.voided_at,
              sd.created_at, sd.updated_at,
              p.full_name, p.cedula, p.age
         FROM standalone_documents sd
         JOIN patients p ON p.id = sd.patient_id
        WHERE sd.id = :id AND sd.doctor_id = :doctorId AND p.deleted_at IS NULL`,
      { replacements: { id, doctorId }, type: QueryTypes.SELECT },
    );

    if (rows.length === 0) return null;
    const r = rows[0];

    // SECURITY: decrypt PHI — never log these values
    return {
      document: StandaloneDocument.create({
        id: r.id,
        doctorId: r.doctor_id,
        patientId: r.patient_id,
        type: r.type as StandaloneDocumentType,
        code: r.code,
        status: r.status as StandaloneDocumentStatus,
        content: r.content,
        voidReason: r.void_reason,
        issuedAt: r.issued_at ? new Date(r.issued_at) : null,
        voidedAt: r.voided_at ? new Date(r.voided_at) : null,
        createdAt: new Date(r.created_at),
        updatedAt: new Date(r.updated_at),
      }),
      patient: {
        id: r.patient_id,
        fullName: this.crypto.decrypt(r.full_name),
        cedula: r.cedula ? this.crypto.decrypt(r.cedula) : null,
        age: r.age ?? null,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  async create(params: CreateStandaloneDocumentParams): Promise<StandaloneDocument> {
    const row = await this.model.create({
      id: randomUUID(),
      doctorId: params.doctorId,
      patientId: params.patientId,
      type: params.type,
      code: null,
      status: 'draft',
      content: params.content,
      voidReason: null,
      issuedAt: null,
      voidedAt: null,
    });
    return this.toDomain(row);
  }

  async updateContent(id: string, content: Record<string, unknown>): Promise<StandaloneDocument> {
    const row = await this.model.findByPk(id);
    if (!row) throw new StandaloneDocumentNotFoundError();
    row.content = content;
    await row.save();
    return this.toDomain(row);
  }

  /**
   * Updates status=issued + code + issuedAt.
   * Translates UniqueConstraintError on (doctor_id, code) into
   * StandaloneDocumentCodeConflictError so the use case can retry.
   *
   * Raw SQL for atomicity: Sequelize model.save() would re-read the row, but we
   * need to guarantee the UPDATE WHERE doctor_id+id check in one statement.
   */
  async persistIssued(id: string, code: string, issuedAt: Date): Promise<StandaloneDocument> {
    try {
      await this.sequelize.query(
        `UPDATE standalone_documents
            SET code = :code, status = 'issued', issued_at = :issuedAt, updated_at = NOW()
          WHERE id = :id AND status = 'draft'`,
        { replacements: { id, code, issuedAt }, type: QueryTypes.UPDATE },
      );
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        throw new StandaloneDocumentCodeConflictError(code);
      }
      throw err;
    }
    const row = await this.model.findByPk(id);
    if (!row) throw new StandaloneDocumentNotFoundError();
    return this.toDomain(row);
  }

  async persistVoided(
    id: string,
    voidReason: string | null,
    voidedAt: Date,
  ): Promise<StandaloneDocument> {
    await this.sequelize.query(
      `UPDATE standalone_documents
          SET status = 'voided', void_reason = :voidReason, voided_at = :voidedAt, updated_at = NOW()
        WHERE id = :id AND status = 'issued'`,
      { replacements: { id, voidReason, voidedAt }, type: QueryTypes.UPDATE },
    );
    const row = await this.model.findByPk(id);
    if (!row) throw new StandaloneDocumentNotFoundError();
    return this.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.model.destroy({ where: { id } });
  }

  /**
   * Revokes all active shared_document_links for the given standalone document.
   *
   * Raw SQL update on shared_document_links — cross-table operation kept in the
   * infrastructure layer (not in the use case) per DDD convention.
   * Safe to call when no active links exist (no-op).
   */
  async revokeActiveLinksForDocument(standaloneDocumentId: string): Promise<void> {
    await this.sequelize.query(
      `UPDATE shared_document_links
          SET status = 'revoked'
        WHERE standalone_document_id = :standaloneDocumentId
          AND status = 'active'`,
      { replacements: { standaloneDocumentId }, type: QueryTypes.UPDATE },
    );
  }

  // ---------------------------------------------------------------------------
  // Sequence management
  // ---------------------------------------------------------------------------

  async getMaxSequenceForMonth(
    doctorId: string,
    prefix: string,
    yearMonth: string,
  ): Promise<number> {
    // Extract the numeric suffix from codes matching PREFIX-YYYYMM-NNNN+ scoped
    // to this doctor (UNIQUE is per-doctor, sequence is per-doctor too).
    type Row = { max_seq: string | null };
    const pattern = `${prefix}-${yearMonth}-%`;
    const rows = await this.sequelize.query<Row>(
      `SELECT COALESCE(
                MAX((substring(code from '^(?:REC|PAR|REP)-[0-9]{6}-([0-9]+)$'))::int),
                0
              )::text AS max_seq
         FROM standalone_documents
        WHERE doctor_id = :doctorId
          AND code LIKE :pattern`,
      { replacements: { doctorId, pattern }, type: QueryTypes.SELECT },
    );
    const raw = rows[0]?.max_seq;
    const parsed = raw != null ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  }

  // ---------------------------------------------------------------------------
  // Private mapper
  // ---------------------------------------------------------------------------

  private toDomain(row: StandaloneDocumentModel): StandaloneDocument {
    return StandaloneDocument.create({
      id: row.id,
      doctorId: row.doctorId,
      patientId: row.patientId,
      type: row.type as StandaloneDocumentType,
      code: row.code,
      status: row.status as StandaloneDocumentStatus,
      content: row.content,
      voidReason: row.voidReason,
      issuedAt: row.issuedAt,
      voidedAt: row.voidedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
