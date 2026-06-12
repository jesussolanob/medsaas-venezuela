import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when an unrecognised rate source is supplied.
 */
export class InvalidRateSourceError extends DomainError {
  readonly code = 'INVALID_RATE_SOURCE';

  constructor(source: string) {
    super(`Unknown rate source: "${source}". Accepted values: binance, bcv, manual`);
  }
}
