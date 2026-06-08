import type { Identity } from '../entities/identity.entity';

export const IDENTITY_REPOSITORY = Symbol('IIdentityRepository');

export interface IdentityCreateData {
  id: string;
  email: string;
  fullName: string;
  role: string;
  auth0Sub: string | null;
}

export interface IIdentityRepository {
  /**
   * Find a profile by email (case-insensitive exact match after normalisation).
   * Returns null when not found.
   */
  findByEmail(email: string): Promise<Identity | null>;

  /**
   * Persist a new profile row and return the created Identity.
   * The caller is responsible for ensuring the email does not already exist.
   */
  create(data: IdentityCreateData): Promise<Identity>;

  /**
   * Update the auth0_sub column for an existing profile.
   * No-op if auth0Sub is null.
   */
  updateAuth0Sub(id: string, auth0Sub: string): Promise<void>;
}
