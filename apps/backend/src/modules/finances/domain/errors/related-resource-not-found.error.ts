import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a related resource referenced in a finance operation
 * (e.g. a consultation linked via relatedConsultationId) is not found
 * or does not belong to the requesting doctor.
 *
 * httpStatus 404 — generic not-found response that does NOT distinguish
 * "resource absent" from "resource owned by another doctor" to prevent
 * existence enumeration across doctor boundaries (anti-IDOR).
 */
export class RelatedResourceNotFoundError extends DomainError {
  readonly code = 'RELATED_RESOURCE_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor() {
    super('Related resource not found');
  }
}
