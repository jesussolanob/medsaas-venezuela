import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when an immediate-consultation request is made but there is no usable
 * time window available (less than 5 minutes before the next active appointment).
 *
 * HTTP 409 Conflict: the server understands the request but the current state
 * of the resource (the doctor's schedule) prevents it from being fulfilled.
 *
 * Callers can retry with `force: true` to override the overlap check and
 * schedule the consultation at full duration regardless of the next appointment.
 */
export class NoImmediateSlotError extends DomainError {
  readonly code = 'NO_IMMEDIATE_SLOT';
  override readonly httpStatus = 409;

  constructor(availableMinutes: number) {
    super(
      `Not enough time for an immediate consultation: only ${availableMinutes} minute(s) available before the next appointment`,
    );
  }
}
