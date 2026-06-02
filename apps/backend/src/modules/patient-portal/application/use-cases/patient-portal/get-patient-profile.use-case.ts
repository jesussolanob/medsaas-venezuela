import { Inject, Injectable } from '@nestjs/common';
import type { Patient } from '../../../../patients/domain/entities/patient.entity';
import {
  PATIENT_PORTAL_REPOSITORY,
  type IPatientPortalRepository,
} from '../../../domain/repositories/patient-portal.repository';

export interface GetPatientProfileInput {
  authUserId: string;
}

/**
 * Returns all patient records linked to this auth_user_id (one per doctor).
 * The patient can see all their own records across doctors.
 *
 * SECURITY: authUserId comes from DevAuthGuard (user.sub). The repository
 * filters strictly by auth_user_id — records of other patients are never returned.
 */
@Injectable()
export class GetPatientProfileUseCase {
  constructor(
    @Inject(PATIENT_PORTAL_REPOSITORY)
    private readonly portalRepo: IPatientPortalRepository,
  ) {}

  async execute(input: GetPatientProfileInput): Promise<Patient[]> {
    return this.portalRepo.findPatientsByAuthUserId(input.authUserId);
  }
}
