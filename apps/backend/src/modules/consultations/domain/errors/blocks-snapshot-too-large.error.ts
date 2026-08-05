import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when the blocks_snapshot JSON exceeds the 300 KB safety cap.
 *
 * 300 000 chars covers ~300 KB of UTF-8 text — large enough for real clinical
 * notes and small enough to prevent intentional payload-bloat attacks.
 * HTTP 422 (inherited from DomainError).
 */
export class BlocksSnapshotTooLargeError extends DomainError {
  readonly code = 'BLOCKS_SNAPSHOT_TOO_LARGE';

  constructor(actualLength: number) {
    super(
      `El contenido de la consulta es demasiado grande (${actualLength} caracteres). El límite es 300 000.`,
    );
  }
}
