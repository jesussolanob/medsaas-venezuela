import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when AES-256-GCM decryption fails for a clinical prescription field.
 *
 * The field parameter is used only for internal diagnostics and is intentionally
 * NOT included in the client-facing message to avoid revealing internal column
 * names. Mapped to 422 by GlobalExceptionFilter.
 */
export class DecryptionError extends DomainError {
  readonly code = 'DECRYPTION_FAILED';

  constructor(_field: string) {
    super('No se pudo leer un dato clínico. Si el problema sigue, contactá a soporte.');
  }
}
