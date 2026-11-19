import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  DOCTOR_DOCUMENT_FILE_REPOSITORY,
  type IDoctorDocumentFileRepository,
} from '../../domain/repositories/doctor-document-file.repository';
import { DoctorDocumentFile } from '../../domain/entities/doctor-document-file.entity';
import { DoctorDocumentFileLimitExceededError } from '../../domain/errors/doctor-document-file-limit-exceeded.error';
import { DoctorDocumentFileInvalidPathError } from '../../domain/errors/doctor-document-file-invalid-path.error';
import type { CreateDoctorDocumentFileDto } from '../dtos/doctor-document-file.dto';
import type { DoctorDocumentFileListItem } from './list-doctor-document-files.use-case';

export interface CreateDoctorDocumentFileInput {
  doctorId: string;
  dto: CreateDoctorDocumentFileDto;
}

/**
 * CreateDoctorDocumentFileUseCase — registers a file in the doctor's library.
 *
 * SECURITY:
 * - filePath must start with `document/<doctorId>/` (exact prefix, no `..`).
 *   This prevents a doctor from registering paths in another doctor's namespace.
 * - doctorId always comes from auth (user.sub), never from the body.
 * - Limit: max MAX_FILES_PER_DOCTOR active files per doctor.
 */
@Injectable()
export class CreateDoctorDocumentFileUseCase {
  constructor(
    @Inject(DOCTOR_DOCUMENT_FILE_REPOSITORY)
    private readonly repo: IDoctorDocumentFileRepository,
  ) {}

  async execute(input: CreateDoctorDocumentFileInput): Promise<DoctorDocumentFileListItem> {
    const { doctorId, dto } = input;

    // 1. Validate storage path ownership (anti-IDOR)
    this.assertValidPath(dto.filePath, doctorId);

    // 2. Enforce per-doctor file limit
    const activeCount = await this.repo.countActiveByDoctor(doctorId);
    if (activeCount >= DoctorDocumentFile.MAX_FILES_PER_DOCTOR) {
      throw new DoctorDocumentFileLimitExceededError();
    }

    // 3. Create domain entity
    const now = new Date();
    const file = DoctorDocumentFile.create({
      id: randomUUID(),
      doctorId,
      name: dto.name,
      storagePath: dto.filePath,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // 4. Persist and return
    const saved = await this.repo.save(file);

    return {
      id: saved.id,
      name: saved.name,
      mimeType: saved.mimeType,
      sizeBytes: saved.sizeBytes,
      createdAt: saved.createdAt.toISOString(),
    };
  }

  /**
   * Guards against path traversal and IDOR.
   * Accepts paths that:
   * - start with exactly `document/<doctorId>/`
   * - have no leading or trailing whitespace
   * - contain no `..` (directory traversal)
   * - contain no `%`, `\`, or NUL characters (defense in depth)
   */
  private assertValidPath(filePath: string, doctorId: string): void {
    const requiredPrefix = `document/${doctorId}/`;
    if (
      filePath !== filePath.trim() ||
      !filePath.startsWith(requiredPrefix) ||
      filePath.includes('..') ||
      filePath.includes('%') ||
      filePath.includes('\\') ||
      filePath.includes('\0')
    ) {
      throw new DoctorDocumentFileInvalidPathError();
    }
  }
}
