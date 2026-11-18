import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a seller tries to change a specialist's follow-up status to the
 * value it already has, without supplying a comment.
 *
 * HTTP 422 (inherited from DomainError).
 *
 * Business rule: transitioning to the same status with no new comment is a
 * no-op — reject it so the history log does not accumulate redundant rows.
 * If the seller wants to add a note without changing status, they should
 * omit the `status` field or send only `{ comment: "..." }`.
 */
export class SpecialistAlreadySameStatusError extends DomainError {
  readonly code = 'SPECIALIST_ALREADY_SAME_STATUS';

  constructor() {
    super('El especialista ya está en ese estado.');
  }
}
