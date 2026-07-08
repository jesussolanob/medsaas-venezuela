import { Inject, Injectable } from '@nestjs/common';
import {
  SHARED_FILE_REPOSITORY,
  type ISharedFileRepository,
} from '../../../domain/repositories/shared-file.repository';
import type { SharedFile } from '../../../domain/entities/shared-file.entity';
import { SharedFileNotFoundError } from '../../../domain/errors/shared-file-not-found.error';
import type { UpdateSharedFileDto } from '../../dtos/shared-file.dto';

export interface UpdateSharedFileDoctorInput extends UpdateSharedFileDto {
  id: string;
  doctorId: string;
}

/**
 * Updates title, description, or status of a shared file.
 * Scoped to the owning doctor (anti-IDOR).
 */
@Injectable()
export class UpdateSharedFileDoctorUseCase {
  constructor(
    @Inject(SHARED_FILE_REPOSITORY)
    private readonly sharedFileRepo: ISharedFileRepository,
  ) {}

  async execute(input: UpdateSharedFileDoctorInput): Promise<SharedFile> {
    // 1. Scope check — returns null if not found or wrong doctor
    const existing = await this.sharedFileRepo.findByIdAndDoctor(input.id, input.doctorId);
    if (!existing) {
      throw new SharedFileNotFoundError();
    }

    // 2. Apply update
    const updated = await this.sharedFileRepo.update(input.id, {
      title: input.title,
      description: input.description,
      status: input.status,
    });

    if (!updated) {
      throw new SharedFileNotFoundError();
    }
    return updated;
  }
}
