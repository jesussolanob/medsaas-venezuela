import { DomainError } from '../../../../domain/errors/domain.error';

export class SuggestionInvalidStatusError extends DomainError {
  readonly code = 'SUGGESTION_INVALID_STATUS';
  override readonly httpStatus = 400;

  constructor(attemptedStatus: string) {
    super(
      `Invalid suggestion status: '${attemptedStatus}'. ` +
        `Must be one of: pending, reviewed, planned, done, rejected`,
    );
  }
}
