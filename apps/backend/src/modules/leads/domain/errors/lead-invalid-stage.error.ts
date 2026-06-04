import { DomainError } from '../../../../domain/errors/domain.error';

export class LeadInvalidStageError extends DomainError {
  readonly code = 'LEAD_INVALID_STAGE';

  constructor(attempted: string) {
    super(
      `"${attempted}" is not a valid lead stage. Valid stages: new, contacted, qualified, appointment, converted, lost`,
    );
  }
}
