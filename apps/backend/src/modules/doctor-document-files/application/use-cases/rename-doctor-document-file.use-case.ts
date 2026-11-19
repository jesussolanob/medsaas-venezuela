import { Inject, Injectable } from '@nestjs/common';
import {
  DOCTOR_DOCUMENT_FILE_REPOSITORY,
  type IDoctorDocumentFileRepository,
} from '../../domain/repositories/doctor-document-file.repository';
import { DoctorDocumentFileNotFoundError } from '../../domain/errors/doctor-document-file-not-found.error';

export interface RenameDoctorDocumentFileInput {
  id: string;
  doctorId: string;
  name: string;
}

/**
 * RenameDoctorDocumentFileUseCase — renames an active file in the library.
 *
 * SECURITY:
 * - Verifies the file exists AND belongs to the requesting doctor (anti-IDOR).
 * - Returns 404 for missing or other-doctor's files (no information leak).
 */
@Injectable()
export class RenameDoctorDocumentFileUseCase {
  constructor(
    @Inject(DOCTOR_DOCUMENT_FILE_REPOSITORY)
    private readonly repo: IDoctorDocumentFileRepository,
  ) {}

  async execute(input: RenameDoctorDocumentFileInput): Promise<void> {
    const { id, doctorId, name } = input;

    // Verify ownership and existence (anti-IDOR)
    const file = await this.repo.findById(id, doctorId);
    if (!file) {
      throw new DoctorDocumentFileNotFoundError();
    }

    await this.repo.rename(id, doctorId, name);
  }
}
