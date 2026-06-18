import type { SharedDocumentLink } from '../entities/shared-document-link.entity';

export const SHARED_DOCUMENT_LINK_REPOSITORY = Symbol('ISharedDocumentLinkRepository');

/**
 * Contract for shared_document_links persistence.
 *
 * The application layer depends only on this interface — never on the
 * Sequelize implementation — to keep the domain layer infrastructure-free.
 */
export interface ISharedDocumentLinkRepository {
  /** Persist a new link. */
  save(link: SharedDocumentLink): Promise<SharedDocumentLink>;

  /** Find an active link by its public URL token. Returns null if not found. */
  findByToken(token: string): Promise<SharedDocumentLink | null>;

  /** Find a link by its internal ID, scoped to the owning doctor (anti-IDOR). */
  findById(id: string, doctorId: string): Promise<SharedDocumentLink | null>;

  /**
   * Atomically increment the link-level failed_attempts counter by 1.
   * Used by verify-code to accumulate failures across all code rotations.
   */
  incrementLinkFailedAttempts(id: string): Promise<void>;

  /**
   * Set last_code_requested_at to the given timestamp.
   * Used by request-code to enforce the 60-second cooldown.
   */
  updateLastCodeRequestedAt(id: string, at: Date): Promise<void>;
}
