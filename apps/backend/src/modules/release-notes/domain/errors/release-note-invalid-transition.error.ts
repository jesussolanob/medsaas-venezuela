import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when an invalid state transition is attempted on a release note.
 *
 * Examples:
 *   - Publishing an already-published note.
 *   - Unpublishing a draft.
 *   - Deleting a published note (must unpublish first).
 *
 * HTTP 409.
 */
export class ReleaseNoteInvalidTransitionError extends DomainError {
  readonly code = 'RELEASE_NOTE_INVALID_TRANSITION';
  override readonly httpStatus = 409;

  constructor(message: string) {
    super(message);
  }
}
