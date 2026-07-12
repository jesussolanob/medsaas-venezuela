import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { LegalDocument } from '../../../domain/entities/legal-document.entity';
import type { ILegalDocumentRepository } from '../../../domain/repositories/legal-document.repository';
import { LegalDocumentModel } from '../models/legal-document.model';

@Injectable()
export class SequelizeLegalDocumentRepository implements ILegalDocumentRepository {
  constructor(
    @InjectModel(LegalDocumentModel)
    private readonly model: typeof LegalDocumentModel,
  ) {}

  async findCurrentByType(docType: string): Promise<LegalDocument | null> {
    const row = await this.model.findOne({
      where: { docType, isCurrent: true },
    });

    return row ? this.toDomain(row) : null;
  }

  private toDomain(row: LegalDocumentModel): LegalDocument {
    return LegalDocument.reconstitute({
      id: row.id,
      docType: row.docType,
      version: row.version,
      contentHtml: row.contentHtml,
      isCurrent: row.isCurrent,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
