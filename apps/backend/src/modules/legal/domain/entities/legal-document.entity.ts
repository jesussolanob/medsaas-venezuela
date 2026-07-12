/**
 * LegalDocument — domain entity representing a versioned legal document
 * (e.g. Terms & Conditions, Privacy Policy) served from the database.
 *
 * No external dependencies (DDD domain rule).
 *
 * Invariants:
 *   - docType must not be empty
 *   - version must not be empty
 *   - contentHtml must not be empty
 *   - only one document with the same docType can be current (enforced at repo level)
 */

export interface LegalDocumentProps {
  id: string;
  docType: string;
  version: string;
  contentHtml: string;
  isCurrent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class LegalDocument {
  readonly id: string;
  readonly docType: string;
  readonly version: string;
  readonly contentHtml: string;
  readonly isCurrent: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: LegalDocumentProps) {
    this.id = props.id;
    this.docType = props.docType;
    this.version = props.version;
    this.contentHtml = props.contentHtml;
    this.isCurrent = props.isCurrent;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /** Reconstitutes an entity from persistence — does not re-validate invariants. */
  static reconstitute(props: LegalDocumentProps): LegalDocument {
    return new LegalDocument(props);
  }
}
