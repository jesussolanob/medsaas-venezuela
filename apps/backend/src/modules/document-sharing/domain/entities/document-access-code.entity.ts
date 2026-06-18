/**
 * DocumentAccessCode domain entity.
 *
 * A 6-digit code associated with a SharedDocumentLink.
 * Each code has a 48-hour expiry and a failed-attempt counter for
 * brute-force protection. After 5 failed attempts the code is effectively
 * blocked and the patient must request a new one.
 */
export interface DocumentAccessCodeCreateParams {
  id: string;
  linkId: string;
  code: string;
  expiresAt: Date;
  usedAt: Date | null;
  failedAttempts: number;
  createdAt: Date;
}

export class DocumentAccessCode {
  readonly id: string;
  readonly linkId: string;
  readonly code: string;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly failedAttempts: number;
  readonly createdAt: Date;

  /** Maximum failed attempts before the code is blocked. */
  static readonly MAX_FAILED_ATTEMPTS = 5;

  constructor(params: DocumentAccessCodeCreateParams) {
    this.id = params.id;
    this.linkId = params.linkId;
    this.code = params.code;
    this.expiresAt = params.expiresAt;
    this.usedAt = params.usedAt;
    this.failedAttempts = params.failedAttempts;
    this.createdAt = params.createdAt;
  }

  /** Returns true when the code has not yet expired. */
  isNotExpired(now: Date): boolean {
    return this.expiresAt > now;
  }

  /** Returns true when the code has not been used. */
  isNotUsed(): boolean {
    return this.usedAt === null;
  }

  /**
   * Returns true when the code has not reached the brute-force threshold.
   * A blocked code must be replaced with a new one via request-code.
   */
  isNotBlocked(): boolean {
    return this.failedAttempts < DocumentAccessCode.MAX_FAILED_ATTEMPTS;
  }

  /** Returns true when this code is still valid for verification. */
  isValidFor(now: Date): boolean {
    return this.isNotExpired(now) && this.isNotUsed() && this.isNotBlocked();
  }

  /** Returns true when the provided 6-digit string matches this code. */
  matches(candidate: string): boolean {
    return this.code === candidate;
  }

  static create(params: DocumentAccessCodeCreateParams): DocumentAccessCode {
    return new DocumentAccessCode(params);
  }
}
