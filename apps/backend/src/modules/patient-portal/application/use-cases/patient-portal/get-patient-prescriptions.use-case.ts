import { Inject, Injectable } from '@nestjs/common';
import type { Prescription } from '../../../../prescriptions/domain/entities/prescription.entity';
import {
  PATIENT_PORTAL_REPOSITORY,
  type IPatientPortalRepository,
} from '../../../domain/repositories/patient-portal.repository';

export interface GetPatientPrescriptionsInput {
  authUserId: string;
}

/**
 * Lists the authenticated patient's prescriptions with medication and dosage decrypted.
 *
 * SECURITY: authUserId comes from DevAuthGuard (user.sub).
 * The lookup chain: authUserId → patient_id(s) → prescriptions.
 * Only prescriptions for patient_id(s) belonging to this authUserId are returned.
 */
@Injectable()
export class GetPatientPrescriptionsUseCase {
  constructor(
    @Inject(PATIENT_PORTAL_REPOSITORY)
    private readonly portalRepo: IPatientPortalRepository,
  ) {}

  async execute(input: GetPatientPrescriptionsInput): Promise<Prescription[]> {
    const patientIds = await this.portalRepo.findPatientIdsByAuthUserId(input.authUserId);
    if (patientIds.length === 0) return [];
    return this.portalRepo.listPrescriptions(patientIds);
  }
}
