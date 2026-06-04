import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a caller attempts to write a protected or unknown setting key.
 */
export class SettingNotAllowedError extends DomainError {
  readonly code = 'SETTING_NOT_ALLOWED';
  override readonly httpStatus = 422;

  constructor(key: string) {
    super(`Setting key '${key}' is not allowed or is protected`);
  }
}
