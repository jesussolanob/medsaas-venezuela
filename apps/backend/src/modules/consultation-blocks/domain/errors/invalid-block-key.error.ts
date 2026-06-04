import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a PUT request contains a block_key that does not exist in
 * the consultation_block_catalog table.
 */
export class InvalidBlockKeyError extends DomainError {
  readonly code = 'INVALID_BLOCK_KEY';
  override readonly httpStatus = 400;

  constructor(blockKey: string) {
    super(`block_key inválido: ${blockKey}`);
  }
}
