import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when the requested appointment modality is incompatible with the
 * office's configured modality.
 *
 * Example: booking an online appointment in an in_person-only office.
 */
export class OfficeModalityMismatchError extends DomainError {
  readonly code = 'OFFICE_MODALITY_MISMATCH';
  override readonly httpStatus = 422;

  constructor(requested: string, officeModality: string) {
    super(
      `Cannot book a '${requested}' appointment at an office configured for '${officeModality}' only`,
    );
  }
}
