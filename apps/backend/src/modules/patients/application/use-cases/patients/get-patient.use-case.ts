import { Inject, Injectable } from '@nestjs/common';
import { Patient } from '../../../domain/entities/patient.entity';
import { PatientNotFoundError } from '../../../domain/errors/patient-not-found.error';
import { UnauthorizedError } from '../../../../../domain/errors/domain.error';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../domain/repositories/patient.repository';

export interface GetPatientInput {
  patientId: string;
  doctorId: string;
}

@Injectable()
export class GetPatientUseCase {
  constructor(
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
  ) {}

  async execute(input: GetPatientInput): Promise<Patient> {
    // findById is scoped to doctorId — returns null for foreign patients (double-layer defense).
    const patient = await this.patientRepo.findById(input.patientId, input.doctorId);
    if (!patient) {
      throw new PatientNotFoundError();
    }
    // Ownership check kept as second layer per domain invariant.
    if (!patient.canBeAccessedBy(input.doctorId)) {
      throw new UnauthorizedError();
    }
    return patient;
  }
}
