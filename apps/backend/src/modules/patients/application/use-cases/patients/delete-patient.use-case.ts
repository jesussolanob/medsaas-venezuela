import { Inject, Injectable } from '@nestjs/common';
import { PatientNotFoundError } from '../../../domain/errors/patient-not-found.error';
import { UnauthorizedError } from '../../../../../domain/errors/domain.error';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../domain/repositories/patient.repository';

export interface DeletePatientInput {
  patientId: string;
  doctorId: string;
}

@Injectable()
export class DeletePatientUseCase {
  constructor(
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
  ) {}

  async execute(input: DeletePatientInput): Promise<void> {
    // findById is scoped to doctorId — foreign patients appear as not-found.
    const patient = await this.patientRepo.findById(input.patientId, input.doctorId);
    if (!patient) {
      throw new PatientNotFoundError();
    }
    if (!patient.canBeAccessedBy(input.doctorId)) {
      throw new UnauthorizedError();
    }
    // softDelete is also scoped to doctorId for defense-in-depth.
    await this.patientRepo.softDelete(input.patientId, input.doctorId);
  }
}
