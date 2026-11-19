import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown by the DoctorDocumentFile entity when invariants are violated at
 * construction time: name empty/too long or mimeType not in the allowed set.
 *
 * This is a defense-in-depth check — the DTO layer (Zod) validates these first.
 */
export class DoctorDocumentFileDataInvalidError extends DomainError {
  readonly code = 'DOCTOR_DOCUMENT_FILE_DATA_INVALID';
  override readonly httpStatus = 422;

  constructor(detail?: string) {
    super(
      detail ??
        'Los datos del archivo no son válidos (nombre vacío, demasiado largo, o tipo de archivo no permitido).',
    );
  }
}
