import { Inject, Injectable } from '@nestjs/common';
import { Prescription } from '../../../domain/entities/prescription.entity';
import {
  IPrescriptionRepository,
  PRESCRIPTION_REPOSITORY,
} from '../../../domain/repositories/prescription.repository';

export interface GetPatientPrescriptionsInput {
  patientId: string;
  doctorId: string;
}

/**
 * Returns all prescriptions for a patient.
 *
 * SECURITY: doctorId is always taken from the authenticated user token.
 * The repository query scopes results to (patientId, doctorId), preventing IDOR.
 */
@Injectable()
export class GetPatientPrescriptionsUseCase {
  constructor(
    @Inject(PRESCRIPTION_REPOSITORY)
    private readonly repo: IPrescriptionRepository,
  ) {}

  async execute(input: GetPatientPrescriptionsInput): Promise<Prescription[]> {
    return this.repo.findByPatient(input.patientId, input.doctorId);
  }
}
