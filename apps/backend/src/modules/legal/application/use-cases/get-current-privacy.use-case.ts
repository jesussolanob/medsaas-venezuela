import { Inject, Injectable } from '@nestjs/common';
import {
  LEGAL_DOCUMENT_REPOSITORY,
  type ILegalDocumentRepository,
} from '../../domain/repositories/legal-document.repository';
import { LegalDocumentNotFoundError } from '../../domain/errors/legal-document-not-found.error';
import { type LegalDocumentOutput } from './get-current-terms.use-case';

/**
 * GetCurrentPrivacyUseCase
 *
 * Returns the current Privacy Policy document from the database.
 * Called by the public GET /api/legal/privacy endpoint — no auth required.
 *
 * Throws LegalDocumentNotFoundError (404) when no current privacy document exists
 * (the frontend then falls back to its built-in static copy).
 */
@Injectable()
export class GetCurrentPrivacyUseCase {
  constructor(
    @Inject(LEGAL_DOCUMENT_REPOSITORY)
    private readonly repo: ILegalDocumentRepository,
  ) {}

  async execute(): Promise<LegalDocumentOutput> {
    const doc = await this.repo.findCurrentByType('privacy');

    if (!doc) {
      throw new LegalDocumentNotFoundError('privacy');
    }

    return {
      type: doc.docType,
      version: doc.version,
      contentHtml: doc.contentHtml,
      updatedAt: doc.updatedAt.toISOString(),
    };
  }
}
