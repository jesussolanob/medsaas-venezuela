import { Inject, Injectable } from '@nestjs/common';
import {
  SHARED_FILE_REPOSITORY,
  type ISharedFileRepository,
} from '../../../domain/repositories/shared-file.repository';
import type { IPatientPortalRepository } from '../../../../patient-portal/domain/repositories/patient-portal.repository';
import { PATIENT_PORTAL_REPOSITORY } from '../../../../patient-portal/domain/repositories/patient-portal.repository';

export interface MarkReadPatientInput {
  authUserId: string;
}

/**
 * Marks read_by_patient = true on all shared files created by the doctor
 * for the authenticated patient (resolved from authUserId).
 */
@Injectable()
export class MarkReadPatientUseCase {
  constructor(
    @Inject(SHARED_FILE_REPOSITORY)
    private readonly sharedFileRepo: ISharedFileRepository,
    @Inject(PATIENT_PORTAL_REPOSITORY)
    private readonly portalRepo: IPatientPortalRepository,
  ) {}

  async execute(input: MarkReadPatientInput): Promise<void> {
    const patientIds = await this.portalRepo.findPatientIdsByAuthUserId(input.authUserId);
    if (patientIds.length === 0) {
      // No patient record — nothing to mark; silent no-op.
      return;
    }
    // Mark read for the primary patient record.
    // patientIds.length > 0 is verified above, so [0] is safe.
    await this.sharedFileRepo.markReadByPatient(patientIds[0] as string);
  }
}
