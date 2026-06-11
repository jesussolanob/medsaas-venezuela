import type { GoogleIntegration } from '../entities/google-integration.entity';

export const GOOGLE_INTEGRATION_REPOSITORY = Symbol('IGoogleIntegrationRepository');

export interface UpsertGoogleIntegrationParams {
  doctorId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: Date | null;
  scope: string | null;
  googleEmail: string | null;
}

export interface UpdateTokensParams {
  doctorId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: Date | null;
}

export interface IGoogleIntegrationRepository {
  /** Find integration by doctorId. Returns null when not connected. */
  findByDoctorId(doctorId: string): Promise<GoogleIntegration | null>;

  /**
   * Upsert (insert or update) the Google integration for the given doctor.
   * Tokens received here are plaintext — the repository encrypts them before writing.
   */
  upsert(params: UpsertGoogleIntegrationParams): Promise<GoogleIntegration>;

  /**
   * Update only the token fields (used after a refresh).
   * Tokens received here are plaintext — the repository encrypts them before writing.
   */
  updateTokens(params: UpdateTokensParams): Promise<void>;

  /** Remove the integration for a doctor. No-op if not found. */
  deleteByDoctorId(doctorId: string): Promise<void>;
}
