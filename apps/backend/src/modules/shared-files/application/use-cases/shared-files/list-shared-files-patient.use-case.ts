import { Inject, Injectable } from '@nestjs/common';
import {
  SHARED_FILE_REPOSITORY,
  type ISharedFileRepository,
} from '../../../domain/repositories/shared-file.repository';
import type { SharedFile } from '../../../domain/entities/shared-file.entity';
import type { IPatientPortalRepository } from '../../../../patient-portal/domain/repositories/patient-portal.repository';
import { PATIENT_PORTAL_REPOSITORY } from '../../../../patient-portal/domain/repositories/patient-portal.repository';

export interface ListSharedFilesPatientInput {
  authUserId: string;
}

/**
 * Lists all shared files for the authenticated patient, derived from authUserId.
 */
@Injectable()
export class ListSharedFilesPatientUseCase {
  constructor(
    @Inject(SHARED_FILE_REPOSITORY)
    private readonly sharedFileRepo: ISharedFileRepository,
    @Inject(PATIENT_PORTAL_REPOSITORY)
    private readonly portalRepo: IPatientPortalRepository,
  ) {}

  async execute(input: ListSharedFilesPatientInput): Promise<SharedFile[]> {
    const patientIds = await this.portalRepo.findPatientIdsByAuthUserId(input.authUserId);
    if (patientIds.length === 0) {
      return [];
    }
    // For multi-doctor patients, list files for the first (primary) patient record.
    // If needed in the future, aggregate across all patient records.
    // patientIds.length > 0 is verified above, so [0] is safe.
    return this.sharedFileRepo.listByPatient(patientIds[0] as string);
  }
}
