import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { WhereOptions } from 'sequelize';
import { DocumentAccessCode } from '../../../domain/entities/document-access-code.entity';
import type { IDocumentAccessCodeRepository } from '../../../domain/repositories/document-access-code.repository';
import { DocumentAccessCodeModel } from '../models/document-access-code.model';

/**
 * Sequelize implementation of IDocumentAccessCodeRepository.
 *
 * Codes are not PHI — they are random 6-digit strings. No encryption needed.
 * However, incrementing failed_attempts and marking used_at use raw SQL updates
 * for atomicity (avoid read-modify-write races).
 */
@Injectable()
export class SequelizeDocumentAccessCodeRepository implements IDocumentAccessCodeRepository {
  constructor(
    @InjectModel(DocumentAccessCodeModel)
    private readonly codeModel: typeof DocumentAccessCodeModel,
  ) {}

  async save(code: DocumentAccessCode): Promise<DocumentAccessCode> {
    const row = await this.codeModel.create({
      id: code.id,
      linkId: code.linkId,
      code: code.code,
      expiresAt: code.expiresAt,
      usedAt: code.usedAt,
      failedAttempts: code.failedAttempts,
    });
    return this.toDomain(row);
  }

  async findLatestByLinkId(linkId: string): Promise<DocumentAccessCode | null> {
    const row = await this.codeModel.findOne({
      where: { linkId } as WhereOptions,
      order: [['created_at', 'DESC']],
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  async incrementFailedAttempts(id: string): Promise<void> {
    await this.codeModel.update(
      {
        failedAttempts: this.codeModel.sequelize!.literal(
          'failed_attempts + 1',
        ) as unknown as number,
      },
      { where: { id } as WhereOptions },
    );
  }

  async markUsed(id: string, usedAt: Date): Promise<void> {
    await this.codeModel.update({ usedAt }, { where: { id } as WhereOptions });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toDomain(row: DocumentAccessCodeModel): DocumentAccessCode {
    return DocumentAccessCode.create({
      id: row.id,
      linkId: row.linkId,
      code: row.code,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt,
      failedAttempts: row.failedAttempts,
      createdAt: row.createdAt,
    });
  }
}
