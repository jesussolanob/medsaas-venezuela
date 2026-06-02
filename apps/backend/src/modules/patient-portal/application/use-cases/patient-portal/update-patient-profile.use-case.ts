import { Inject, Injectable } from '@nestjs/common';
import type { Patient } from '../../../../patients/domain/entities/patient.entity';
import { PatientPortalAccessDeniedError } from '../../../domain/errors/patient-portal-access-denied.error';
import {
  PATIENT_PORTAL_REPOSITORY,
  type IPatientPortalRepository,
} from '../../../domain/repositories/patient-portal.repository';

export interface UpdatePatientProfileInput {
  authUserId: string;
  /** The patients.id to update — must belong to authUserId. */
  patientId: string;
  /** Only non-PHI fields may be updated by the patient. */
  address?: string | null;
  city?: string | null;
  notes?: string | null;
}

/**
 * Updates non-PHI fields on a patient record, scoped strictly to the
 * authenticated patient's auth_user_id.
 *
 * SECURITY:
 *   - patientId is validated against authUserId in the repository layer.
 *     A patient cannot update records that belong to a different auth_user_id.
 *   - Only non-PHI fields (address, city, notes) are accepted from the patient.
 *     Full-name, cedula, phone, email may only be changed by the doctor.
 */
@Injectable()
export class UpdatePatientProfileUseCase {
  constructor(
    @Inject(PATIENT_PORTAL_REPOSITORY)
    private readonly portalRepo: IPatientPortalRepository,
  ) {}

  async execute(input: UpdatePatientProfileInput): Promise<Patient> {
    const updated = await this.portalRepo.updatePatient(input.patientId, input.authUserId, {
      address: input.address,
      city: input.city,
      notes: input.notes,
    });

    if (!updated) {
      throw new PatientPortalAccessDeniedError();
    }

    return updated;
  }
}
