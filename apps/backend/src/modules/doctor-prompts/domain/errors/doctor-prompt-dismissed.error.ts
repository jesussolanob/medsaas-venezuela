import { DomainError } from '../../../../domain/errors/domain.error';

export class DoctorPromptDismissedError extends DomainError {
  readonly code = 'DOCTOR_PROMPT_DISMISSED';
  constructor() {
    super('Este aviso ya fue descartado permanentemente.');
  }
}
