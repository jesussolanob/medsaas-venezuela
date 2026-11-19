import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a share request includes more than the allowed number of attachments.
 * Maximum: 10 attachments per link.
 */
export class TooManyAttachmentsError extends DomainError {
  readonly code = 'TOO_MANY_ATTACHMENTS';
  override readonly httpStatus = 422;

  constructor() {
    super('Puedes adjuntar hasta 10 archivos por envío.');
  }
}
