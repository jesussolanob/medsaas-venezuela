import type { CredentialVerifier } from '../entities/credential-verifier.entity';

export const CREDENTIAL_VERIFIER_REPOSITORY = Symbol('ICredentialVerifierRepository');

export interface ICredentialVerifierRepository {
  /**
   * Finds the first active verifier registered for the given credential type.
   * Returns null when no active verifier exists.
   */
  findActiveByCredentialType(credentialType: string): Promise<CredentialVerifier | null>;

  /**
   * Returns all verifiers, for admin inspection.
   */
  findAll(): Promise<CredentialVerifier[]>;
}
