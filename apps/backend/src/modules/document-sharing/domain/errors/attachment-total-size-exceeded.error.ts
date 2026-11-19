import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when the total declared size of all attachments in a share request
 * exceeds the 25 MB per-link limit.
 */
export class AttachmentTotalSizeExceededError extends DomainError {
  readonly code = 'ATTACHMENT_TOTAL_SIZE_EXCEEDED';
  override readonly httpStatus = 422;

  constructor() {
    super('Los adjuntos superan el máximo de 25 MB por envío.');
  }
}
