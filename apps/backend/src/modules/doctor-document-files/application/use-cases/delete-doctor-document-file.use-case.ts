import { Inject, Injectable } from '@nestjs/common';
import {
  DOCTOR_DOCUMENT_FILE_REPOSITORY,
  type IDoctorDocumentFileRepository,
} from '../../domain/repositories/doctor-document-file.repository';
import { DoctorDocumentFileNotFoundError } from '../../domain/errors/doctor-document-file-not-found.error';

export interface DeleteDoctorDocumentFileInput {
  id: string;
  doctorId: string;
}

/**
 * DeleteDoctorDocumentFileUseCase — soft-deletes a file from the library.
 *
 * The file is NOT removed from storage because:
 * - Storage has no delete operation.
 * - Existing share links may still reference the stored object.
 *
 * SECURITY:
 * - Verifies the file exists AND belongs to the requesting doctor (anti-IDOR).
 * - Returns 404 for missing or other-doctor's files.
 */
@Injectable()
export class DeleteDoctorDocumentFileUseCase {
  constructor(
    @Inject(DOCTOR_DOCUMENT_FILE_REPOSITORY)
    private readonly repo: IDoctorDocumentFileRepository,
  ) {}

  async execute(input: DeleteDoctorDocumentFileInput): Promise<void> {
    const { id, doctorId } = input;

    // Verify ownership and existence (anti-IDOR)
    const file = await this.repo.findById(id, doctorId);
    if (!file) {
      throw new DoctorDocumentFileNotFoundError();
    }

    await this.repo.softDelete(id, doctorId);
  }
}
