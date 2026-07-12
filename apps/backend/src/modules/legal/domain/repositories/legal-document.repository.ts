import type { LegalDocument } from '../entities/legal-document.entity';

export const LEGAL_DOCUMENT_REPOSITORY = Symbol('ILegalDocumentRepository');

export interface ILegalDocumentRepository {
  /**
   * Returns the current document for the given docType (is_current = true).
   * Returns null when no current document exists for that type.
   */
  findCurrentByType(docType: string): Promise<LegalDocument | null>;
}
