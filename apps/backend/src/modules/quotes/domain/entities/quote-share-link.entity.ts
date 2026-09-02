/**
 * QuoteShareLink domain entity — a single-use public access token for a quote.
 *
 * Invariants:
 *   - isValid(): token has not expired and has not been revoked.
 *   - isExpired(): expiresAt is in the past OR revokedAt is set.
 *
 * Token: 48 bytes encoded as base64url (~64 characters).
 * Lifetime: validUntil date of the quote, or 30 days if validUntil is null.
 *
 * No imports from NestJS, Sequelize, or any external library.
 */

export interface QuoteShareLinkCreateParams {
  id: string;
  quoteId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
}

export class QuoteShareLink {
  readonly id: string;
  readonly quoteId: string;
  readonly token: string;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly revokedAt: Date | null;

  constructor(params: QuoteShareLinkCreateParams) {
    this.id = params.id;
    this.quoteId = params.quoteId;
    this.token = params.token;
    this.expiresAt = params.expiresAt;
    this.createdAt = params.createdAt;
    this.revokedAt = params.revokedAt;
  }

  /** Returns true when the link is valid (not expired and not revoked). */
  isValid(now: Date = new Date()): boolean {
    if (this.revokedAt !== null) return false;
    return this.expiresAt > now;
  }

  /** Returns true when the link has expired or been revoked. */
  isExpired(now: Date = new Date()): boolean {
    return !this.isValid(now);
  }

  static create(params: QuoteShareLinkCreateParams): QuoteShareLink {
    return new QuoteShareLink(params);
  }
}
