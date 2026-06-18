import type { DocumentAccessCode } from '../entities/document-access-code.entity';

export const DOCUMENT_ACCESS_CODE_REPOSITORY = Symbol('IDocumentAccessCodeRepository');

/**
 * Contract for document_access_codes persistence.
 *
 * The application layer depends only on this interface — never on the
 * Sequelize implementation.
 */
export interface IDocumentAccessCodeRepository {
  /** Persist a new access code. */
  save(code: DocumentAccessCode): Promise<DocumentAccessCode>;

  /**
   * Find the most recent (by createdAt DESC) access code for a given link.
   * Returns null when no codes exist for that link.
   */
  findLatestByLinkId(linkId: string): Promise<DocumentAccessCode | null>;

  /** Increment failed_attempts by 1 for the given code record. */
  incrementFailedAttempts(id: string): Promise<void>;

  /** Mark a code as used by setting used_at to the given timestamp. */
  markUsed(id: string, usedAt: Date): Promise<void>;
}
