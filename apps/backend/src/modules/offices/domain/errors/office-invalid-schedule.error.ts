import { DomainError } from '../../../../domain/errors/domain.error';

export class OfficeInvalidScheduleError extends DomainError {
  readonly code = 'OFFICE_INVALID_SCHEDULE';
  override readonly httpStatus = 422;

  constructor(reason?: string) {
    super(reason ?? 'Invalid schedule configuration for office');
  }
}
