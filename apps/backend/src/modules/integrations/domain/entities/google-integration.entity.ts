/**
 * GoogleIntegration domain entity.
 *
 * Represents a doctor's Google OAuth connection (Calendar/Meet).
 * Tokens are stored encrypted in the DB — this entity holds plaintext tokens
 * ONLY in memory during the current request lifecycle.
 *
 * No imports from NestJS, Sequelize, or any external library (DDD rule).
 */
export interface GoogleIntegrationCreateParams {
  id: string;
  doctorId: string;
  /** Plaintext access token (decrypted by repository layer before returning). */
  accessToken: string;
  /** Plaintext refresh token (decrypted by repository layer before returning). */
  refreshToken: string;
  tokenExpiry: Date | null;
  scope: string | null;
  googleEmail: string | null;
  connectedAt: Date;
  updatedAt: Date;
}

export class GoogleIntegration {
  readonly id: string;
  readonly doctorId: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly tokenExpiry: Date | null;
  readonly scope: string | null;
  readonly googleEmail: string | null;
  readonly connectedAt: Date;
  readonly updatedAt: Date;

  constructor(params: GoogleIntegrationCreateParams) {
    this.id = params.id;
    this.doctorId = params.doctorId;
    this.accessToken = params.accessToken;
    this.refreshToken = params.refreshToken;
    this.tokenExpiry = params.tokenExpiry;
    this.scope = params.scope;
    this.googleEmail = params.googleEmail;
    this.connectedAt = params.connectedAt;
    this.updatedAt = params.updatedAt;
  }

  /** Returns true if the access token has expired or expires within the given buffer. */
  isTokenExpired(bufferMs = 5 * 60 * 1000): boolean {
    if (!this.tokenExpiry) return false;
    return Date.now() + bufferMs >= this.tokenExpiry.getTime();
  }

  /** Returns true when the given doctorId is the owner of this integration. */
  isOwnedBy(doctorId: string): boolean {
    return this.doctorId === doctorId;
  }

  /**
   * Returns a new GoogleIntegration with refreshed token data (immutable pattern).
   */
  withRefreshedTokens(
    accessToken: string,
    refreshToken: string,
    tokenExpiry: Date | null,
  ): GoogleIntegration {
    return new GoogleIntegration({
      ...this.toParams(),
      accessToken,
      refreshToken,
      tokenExpiry,
      updatedAt: new Date(),
    });
  }

  static create(params: GoogleIntegrationCreateParams): GoogleIntegration {
    return new GoogleIntegration(params);
  }

  private toParams(): GoogleIntegrationCreateParams {
    return {
      id: this.id,
      doctorId: this.doctorId,
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      tokenExpiry: this.tokenExpiry,
      scope: this.scope,
      googleEmail: this.googleEmail,
      connectedAt: this.connectedAt,
      updatedAt: this.updatedAt,
    };
  }
}
