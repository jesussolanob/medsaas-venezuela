import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a blocks_snapshot value contains arrays/objects nested deeper
 * than the sanitizer's recursion limit.
 *
 * Defense in depth against a maliciously deeply-nested payload that would
 * otherwise cause a stack overflow (denial of service) while the sanitizer
 * recurses through it. HTTP 422 (inherited from DomainError).
 */
export class BlocksSnapshotTooDeepError extends DomainError {
  readonly code = 'BLOCKS_SNAPSHOT_TOO_DEEP';

  constructor(maxDepth: number) {
    super(
      `El contenido de la consulta tiene una estructura demasiado anidada. El límite es ${maxDepth} niveles.`,
    );
  }
}
