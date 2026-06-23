import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a month string does not match the expected YYYY-MM format or
 * contains an out-of-range month number.
 *
 * httpStatus 400 — the caller supplied a malformed parameter.
 *
 * The message is intentionally generic: it does NOT echo the received value
 * to avoid leaking caller-supplied input into error responses.
 */
export class InvalidMonthFormatError extends DomainError {
  readonly code = 'INVALID_MONTH_FORMAT';
  override readonly httpStatus = 400;

  constructor() {
    super('Month parameter must be in YYYY-MM format with a valid month (01–12)');
  }
}
