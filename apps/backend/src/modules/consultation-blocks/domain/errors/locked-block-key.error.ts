import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a PATCH /label request targets a block key that belongs to
 * the system-locked set (LOCKED_BLOCK_KEYS). These blocks have canonical
 * labels that must remain consistent across all consultations.
 */
export class LockedBlockKeyError extends DomainError {
  readonly code = 'LOCKED_BLOCK_KEY';
  override readonly httpStatus = 400;

  constructor(blockKey: string) {
    super(`El bloque '${blockKey}' no puede ser renombrado`);
  }
}
