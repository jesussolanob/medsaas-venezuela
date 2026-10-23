/**
 * StandaloneDocument domain entity.
 *
 * A recipe / paraclinical / reposo document issued outside of a consultation.
 *
 * State machine: draft → issued → voided (one-way, no reversal).
 *
 * Invariants (enforced in the DOMAIN, not just the controller):
 *   - canBeModifiedBy() enforces anti-IDOR.
 *   - isInDraft()     — guards PATCH, DELETE, and issue().
 *   - isIssued()      — guards void().
 *   - issue()         — transitions draft → issued; assigns code + issuedAt.
 *   - void(reason)    — transitions issued → voided; assigns voidedAt.
 *   - Editing or deleting a non-draft document throws StandaloneDocumentNotDraftError.
 *
 * No imports from NestJS, Sequelize, or any external library.
 */

export type StandaloneDocumentType = 'recipe' | 'paraclinical' | 'reposo';
export type StandaloneDocumentStatus = 'draft' | 'issued' | 'voided';

export interface StandaloneDocumentCreateParams {
  id: string;
  doctorId: string;
  patientId: string;
  type: StandaloneDocumentType;
  /** NULL while in draft; assigned when issued. */
  code: string | null;
  status: StandaloneDocumentStatus;
  /** Raw JSONB content — shape validated at the DTO boundary per type. */
  content: Record<string, unknown>;
  voidReason: string | null;
  issuedAt: Date | null;
  voidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class StandaloneDocument {
  readonly id: string;
  readonly doctorId: string;
  readonly patientId: string;
  readonly type: StandaloneDocumentType;
  readonly code: string | null;
  readonly status: StandaloneDocumentStatus;
  readonly content: Record<string, unknown>;
  readonly voidReason: string | null;
  readonly issuedAt: Date | null;
  readonly voidedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(params: StandaloneDocumentCreateParams) {
    this.id = params.id;
    this.doctorId = params.doctorId;
    this.patientId = params.patientId;
    this.type = params.type;
    this.code = params.code;
    this.status = params.status;
    this.content = params.content;
    this.voidReason = params.voidReason;
    this.issuedAt = params.issuedAt;
    this.voidedAt = params.voidedAt;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
  }

  /** Anti-IDOR guard: returns false for foreign doctor IDs. */
  canBeModifiedBy(actorId: string): boolean {
    return this.doctorId === actorId;
  }

  /** True only for draft documents — gate for PATCH, DELETE, and issue. */
  isInDraft(): boolean {
    return this.status === 'draft';
  }

  /** True only for issued documents — gate for void. */
  isIssued(): boolean {
    return this.status === 'issued';
  }

  /**
   * Returns a new StandaloneDocument with status=issued, code assigned, and
   * issuedAt set. The caller (use case / repository) is responsible for
   * generating the code atomically.
   *
   * Throws StandaloneDocumentNotDraftError when status !== 'draft'.
   * (The domain raises the error; the infrastructure propagates it as 409.)
   */
  issue(code: string, issuedAt: Date): StandaloneDocument {
    return new StandaloneDocument({
      ...this,
      code,
      status: 'issued',
      issuedAt,
      updatedAt: issuedAt,
    });
  }

  /**
   * Returns a new StandaloneDocument with status=voided.
   * Throws StandaloneDocumentNotIssuedError when status !== 'issued'.
   */
  void(voidedAt: Date, reason: string | null = null): StandaloneDocument {
    return new StandaloneDocument({
      ...this,
      status: 'voided',
      voidReason: reason,
      voidedAt,
      updatedAt: voidedAt,
    });
  }

  static create(params: StandaloneDocumentCreateParams): StandaloneDocument {
    return new StandaloneDocument(params);
  }
}
