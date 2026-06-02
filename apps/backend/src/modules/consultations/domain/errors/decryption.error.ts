import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when AES-256-GCM decryption fails for a clinical field.
 *
 * This typically indicates key rotation without re-encryption, or data
 * corruption. The field name is included only for internal diagnostics —
 * it never contains PHI.
 *
 * Mapped to 422 by GlobalExceptionFilter so the client receives a clear,
 * typed error instead of a generic 500.
 */
export class DecryptionError extends DomainError {
  readonly code = 'DECRYPTION_FAILED';

  constructor(field: string) {
    super(`Failed to decrypt field "${field}". Data may be corrupted or the key has changed.`);
  }
}
