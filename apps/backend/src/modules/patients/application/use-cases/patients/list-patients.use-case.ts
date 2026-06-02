import { Inject, Injectable } from '@nestjs/common';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
  type PatientListResult,
} from '../../../domain/repositories/patient.repository';

export interface ListPatientsInput {
  doctorId: string;
  source?: string;
  page: number;
  limit: number;
}

@Injectable()
export class ListPatientsUseCase {
  constructor(
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
  ) {}

  async execute(input: ListPatientsInput): Promise<PatientListResult> {
    return this.patientRepo.list({
      doctorId: input.doctorId,
      source: input.source,
      page: input.page,
      limit: input.limit,
    });
  }
}
