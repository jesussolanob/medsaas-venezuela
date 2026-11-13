import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a release note field fails validation (title/body invariants).
 * HTTP 422.
 */
export class ReleaseNoteInvalidError extends DomainError {
  readonly code = 'RELEASE_NOTE_INVALID';

  constructor(reason: string) {
    super(reason);
  }
}
