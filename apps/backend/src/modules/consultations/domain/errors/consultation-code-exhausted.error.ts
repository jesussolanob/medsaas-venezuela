import { DomainError } from '../../../../domain/errors/domain.error';

export class ConsultationCodeExhaustedError extends DomainError {
  readonly code = 'CONSULTATION_CODE_EXHAUSTED';

  constructor(yearMonth: string) {
    super(
      `Unable to generate a unique consultation code for period ${yearMonth}. Try again later.`,
    );
  }
}
