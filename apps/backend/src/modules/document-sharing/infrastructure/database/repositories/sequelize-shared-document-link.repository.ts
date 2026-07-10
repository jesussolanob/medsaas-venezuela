import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { literal } from 'sequelize';
import type { WhereOptions } from 'sequelize';
import type {
  DocSelection,
  DocumentSections,
  SharedDocumentLinkCreateParams,
} from '../../../domain/entities/shared-document-link.entity';
import { SharedDocumentLink } from '../../../domain/entities/shared-document-link.entity';
import type { ISharedDocumentLinkRepository } from '../../../domain/repositories/shared-document-link.repository';
import { SharedDocumentLinkModel } from '../models/shared-document-link.model';

/**
 * Sequelize implementation of ISharedDocumentLinkRepository.
 *
 * No PHI is stored in this table — the token, sections, and status are all
 * non-sensitive metadata. The actual PHI lives in consultations/ehr/prescriptions
 * and is decrypted on-demand during PDF generation.
 */
@Injectable()
export class SequelizeSharedDocumentLinkRepository implements ISharedDocumentLinkRepository {
  constructor(
    @InjectModel(SharedDocumentLinkModel)
    private readonly linkModel: typeof SharedDocumentLinkModel,
  ) {}

  async save(link: SharedDocumentLink): Promise<SharedDocumentLink> {
    const row = await this.linkModel.create({
      id: link.id,
      consultationId: link.consultationId,
      doctorId: link.doctorId,
      patientId: link.patientId,
      token: link.token,
      sections: link.sections,
      docSelection: link.docSelection ?? null,
      status: link.status,
    });
    return this.toDomain(row);
  }

  async findByToken(token: string): Promise<SharedDocumentLink | null> {
    const row = await this.linkModel.findOne({
      where: { token } as WhereOptions,
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  async findById(id: string, doctorId: string): Promise<SharedDocumentLink | null> {
    const row = await this.linkModel.findOne({
      where: { id, doctorId } as WhereOptions,
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  async incrementLinkFailedAttempts(id: string): Promise<void> {
    await this.linkModel.update({ failedAttempts: literal('failed_attempts + 1') } as object, {
      where: { id } as WhereOptions,
    });
  }

  async updateLastCodeRequestedAt(id: string, at: Date): Promise<void> {
    await this.linkModel.update({ lastCodeRequestedAt: at } as object, {
      where: { id } as WhereOptions,
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toDomain(row: SharedDocumentLinkModel): SharedDocumentLink {
    const rawSections = row.sections as Record<string, unknown>;
    const sections: DocumentSections = {
      report: rawSections['report'] === true,
      prescriptions: rawSections['prescriptions'] === true,
      ehr: rawSections['ehr'] === true,
    };

    const docSelection = this.parseDocSelection(row.docSelection);

    const params: SharedDocumentLinkCreateParams = {
      id: row.id,
      consultationId: row.consultationId,
      doctorId: row.doctorId,
      patientId: row.patientId,
      token: row.token,
      sections,
      docSelection,
      status: row.status as 'active' | 'revoked',
      failedAttempts: row.failedAttempts ?? 0,
      lastCodeRequestedAt: row.lastCodeRequestedAt ?? null,
      createdAt: row.createdAt,
    };
    return SharedDocumentLink.create(params);
  }

  /**
   * Safely parses the raw JSONB `doc_selection` column into a typed DocSelection.
   * Returns null when the column is absent, null, or malformed (backward-compat).
   */
  private parseDocSelection(raw: Record<string, unknown> | null | undefined): DocSelection | null {
    if (!raw) return null;
    const types = Array.isArray(raw['types']) ? (raw['types'] as string[]) : [];
    const informeBlockKeys = Array.isArray(raw['informeBlockKeys'])
      ? (raw['informeBlockKeys'] as string[])
      : [];
    return { types, informeBlockKeys };
  }
}
