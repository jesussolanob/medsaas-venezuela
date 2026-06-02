import { Inject, Injectable } from '@nestjs/common';
import { EhrRecord } from '../../../domain/entities/ehr-record.entity';
import { IEhrRepository, EHR_REPOSITORY } from '../../../domain/repositories/ehr.repository';

export interface GetPatientEhrInput {
  patientId: string;
  doctorId: string;
}

/**
 * Returns the full EHR history for a patient.
 *
 * SECURITY: doctorId is always taken from the authenticated user token.
 * The repository query scopes results to (patientId, doctorId), preventing IDOR.
 */
@Injectable()
export class GetPatientEhrUseCase {
  constructor(
    @Inject(EHR_REPOSITORY)
    private readonly repo: IEhrRepository,
  ) {}

  async execute(input: GetPatientEhrInput): Promise<EhrRecord[]> {
    return this.repo.findByPatient(input.patientId, input.doctorId);
  }
}
