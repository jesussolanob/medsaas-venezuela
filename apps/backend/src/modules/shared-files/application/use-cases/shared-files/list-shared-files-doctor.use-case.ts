import { Inject, Injectable } from '@nestjs/common';
import {
  SHARED_FILE_REPOSITORY,
  type ISharedFileRepository,
} from '../../../domain/repositories/shared-file.repository';
import type { SharedFile } from '../../../domain/entities/shared-file.entity';
import { PatientNotUnderDoctorError } from '../../../domain/errors/patient-not-under-doctor.error';
import { PATIENT_REPOSITORY } from '../../../../patients/domain/repositories/patient.repository';
import type { IPatientRepository } from '../../../../patients/domain/repositories/patient.repository';

export interface ListSharedFilesDoctorInput {
  doctorId: string;
  patientId: string;
}

/**
 * Lists all shared files for a (doctorId, patientId) pair.
 * Validates that the patient belongs to the doctor before querying.
 */
@Injectable()
export class ListSharedFilesDoctorUseCase {
  constructor(
    @Inject(SHARED_FILE_REPOSITORY)
    private readonly sharedFileRepo: ISharedFileRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
  ) {}

  async execute(input: ListSharedFilesDoctorInput): Promise<SharedFile[]> {
    const patient = await this.patientRepo.findById(input.patientId, input.doctorId);
    if (!patient) {
      throw new PatientNotUnderDoctorError();
    }
    return this.sharedFileRepo.listByDoctorAndPatient(input.doctorId, input.patientId);
  }
}
