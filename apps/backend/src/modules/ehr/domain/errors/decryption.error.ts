import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when AES-256-GCM decryption fails for a clinical EHR field.
 *
 * This typically indicates key rotation without re-encryption, or data
 * corruption. The field parameter is used only for internal diagnostics and is
 * intentionally NOT included in the client-facing message to avoid revealing
 * internal column names.
 *
 * Mapped to 422 by GlobalExceptionFilter so the client receives a typed error
 * instead of a generic 500.
 */
export class DecryptionError extends DomainError {
  readonly code = 'DECRYPTION_FAILED';

  constructor(_field: string) {
    super('No se pudo leer un dato clínico. Si el problema sigue, contactá a soporte.');
  }
}
