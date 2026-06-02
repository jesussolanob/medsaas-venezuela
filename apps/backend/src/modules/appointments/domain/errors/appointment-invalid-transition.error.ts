import { DomainError } from '../../../../domain/errors/domain.error';
import type { AppointmentStatus } from '@delta/shared-types';

export class AppointmentInvalidTransitionError extends DomainError {
  readonly code = 'APPOINTMENT_INVALID_TRANSITION';

  constructor(from: AppointmentStatus, to: AppointmentStatus) {
    super(`Cannot transition appointment from '${from}' to '${to}'`);
  }
}
