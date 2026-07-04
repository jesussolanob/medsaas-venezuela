import { timingSafeEqual } from 'crypto';

/**
 * PatientRequestAccessCode domain entity.
 *
 * A 6-digit code associated with a PatientRequest.
 * Each code has a 48-hour expiry and a failed-attempt counter for
 * brute-force protection. After 5 failed attempts the code is effectively
 * blocked and the patient must request a new one.
 */
export interface PatientRequestAccessCodeCreateParams {
  id: string;
  requestId: string;
  code: string;
  expiresAt: Date;
  usedAt: Date | null;
  failedAttempts: number;
  createdAt: Date;
}

export class PatientRequestAccessCode {
  readonly id: string;
  readonly requestId: string;
  readonly code: string;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly failedAttempts: number;
  readonly createdAt: Date;

  /** Maximum failed attempts before the code is blocked. */
  static readonly MAX_FAILED_ATTEMPTS = 5;

  constructor(params: PatientRequestAccessCodeCreateParams) {
    this.id = params.id;
    this.requestId = params.requestId;
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
    return this.failedAttempts < PatientRequestAccessCode.MAX_FAILED_ATTEMPTS;
  }

  /** Returns true when this code is still valid for verification. */
  isValidFor(now: Date): boolean {
    return this.isNotExpired(now) && this.isNotUsed() && this.isNotBlocked();
  }

  /**
   * Returns true when the provided 6-digit string matches this code.
   *
   * Uses timing-safe comparison to prevent timing-oracle attacks even though
   * the code is only 6 digits (defense in depth, consistent with HMAC validation).
   */
  matches(candidate: string): boolean {
    if (this.code.length !== candidate.length) return false;
    return timingSafeEqual(Buffer.from(this.code), Buffer.from(candidate));
  }

  static create(params: PatientRequestAccessCodeCreateParams): PatientRequestAccessCode {
    return new PatientRequestAccessCode(params);
  }
}
