import { Inject, Injectable } from '@nestjs/common';
import {
  SHARED_FILE_REPOSITORY,
  type ISharedFileRepository,
} from '../../../domain/repositories/shared-file.repository';
import { SharedFileNotFoundError } from '../../../domain/errors/shared-file-not-found.error';

export interface DeleteSharedFileDoctorInput {
  id: string;
  doctorId: string;
}

/**
 * Deletes a shared file row. Scoped to the owning doctor (anti-IDOR).
 *
 * TODO: delete the corresponding GCS object when the storage port supports
 * object deletion. For now only the DB row is removed.
 */
@Injectable()
export class DeleteSharedFileDoctorUseCase {
  constructor(
    @Inject(SHARED_FILE_REPOSITORY)
    private readonly sharedFileRepo: ISharedFileRepository,
  ) {}

  async execute(input: DeleteSharedFileDoctorInput): Promise<void> {
    const existing = await this.sharedFileRepo.findByIdAndDoctor(input.id, input.doctorId);
    if (!existing) {
      throw new SharedFileNotFoundError();
    }
    await this.sharedFileRepo.delete(input.id);
  }
}
