import { Inject, Injectable } from '@nestjs/common';
import {
  LEGAL_DOCUMENT_REPOSITORY,
  type ILegalDocumentRepository,
} from '../../domain/repositories/legal-document.repository';
import { LegalDocumentNotFoundError } from '../../domain/errors/legal-document-not-found.error';

export interface LegalDocumentOutput {
  type: string;
  version: string;
  contentHtml: string;
  updatedAt: string;
}

/**
 * GetCurrentTermsUseCase
 *
 * Returns the current Terms & Conditions document from the database.
 * Called by the public GET /api/legal/terms endpoint — no auth required.
 *
 * Throws LegalDocumentNotFoundError (404) when no current terms document exists.
 */
@Injectable()
export class GetCurrentTermsUseCase {
  constructor(
    @Inject(LEGAL_DOCUMENT_REPOSITORY)
    private readonly repo: ILegalDocumentRepository,
  ) {}

  async execute(): Promise<LegalDocumentOutput> {
    const doc = await this.repo.findCurrentByType('terms');

    if (!doc) {
      throw new LegalDocumentNotFoundError('terms');
    }

    return {
      type: doc.docType,
      version: doc.version,
      contentHtml: doc.contentHtml,
      updatedAt: doc.updatedAt.toISOString(),
    };
  }
}
