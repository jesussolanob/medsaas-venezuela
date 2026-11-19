import { Inject, Injectable } from '@nestjs/common';
import {
  DOCTOR_DOCUMENT_FILE_REPOSITORY,
  type IDoctorDocumentFileRepository,
} from '../../domain/repositories/doctor-document-file.repository';
import { DoctorDocumentFileNotFoundError } from '../../domain/errors/doctor-document-file-not-found.error';
import { STORAGE_PORT, type IStoragePort } from '../../../storage/application/ports/storage.port';

/** Short-lived signed URL TTL for doctor preview (5 minutes). */
const PREVIEW_TTL_MS = 5 * 60 * 1000;

export interface GetDoctorDocumentFileUrlInput {
  id: string;
  doctorId: string;
}

export interface GetDoctorDocumentFileUrlOutput {
  url: string;
}

/**
 * GetDoctorDocumentFileUrlUseCase — returns a short-lived signed URL for preview.
 *
 * The doctor uses this to preview a file in the library before attaching it
 * to a share. The URL is valid for 5 minutes (PREVIEW_TTL_MS).
 *
 * SECURITY:
 * - Verifies the file exists AND belongs to the requesting doctor (anti-IDOR).
 * - Returns 404 for missing or other-doctor's files.
 * - TTL is short to limit exposure of private storage objects.
 */
@Injectable()
export class GetDoctorDocumentFileUrlUseCase {
  constructor(
    @Inject(DOCTOR_DOCUMENT_FILE_REPOSITORY)
    private readonly repo: IDoctorDocumentFileRepository,
    @Inject(STORAGE_PORT)
    private readonly storage: IStoragePort,
  ) {}

  async execute(input: GetDoctorDocumentFileUrlInput): Promise<GetDoctorDocumentFileUrlOutput> {
    const { id, doctorId } = input;

    // Verify ownership and existence (anti-IDOR)
    const file = await this.repo.findById(id, doctorId);
    if (!file) {
      throw new DoctorDocumentFileNotFoundError();
    }

    const url = await this.storage.getSignedUrl(file.storagePath, PREVIEW_TTL_MS);
    return { url };
  }
}
