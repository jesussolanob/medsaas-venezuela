import { Inject, Injectable } from '@nestjs/common';
import {
  SHARED_FILE_REPOSITORY,
  type ISharedFileRepository,
} from '../../../domain/repositories/shared-file.repository';
import { PatientNotUnderDoctorError } from '../../../domain/errors/patient-not-under-doctor.error';
import { PATIENT_REPOSITORY } from '../../../../patients/domain/repositories/patient.repository';
import type { IPatientRepository } from '../../../../patients/domain/repositories/patient.repository';

export interface MarkReadDoctorInput {
  doctorId: string;
  patientId: string;
}

/**
 * Marks read_by_doctor = true on all shared files created by the patient
 * for the given (doctorId, patientId) pair.
 * Validates patient ownership first to prevent IDOR.
 */
@Injectable()
export class MarkReadDoctorUseCase {
  constructor(
    @Inject(SHARED_FILE_REPOSITORY)
    private readonly sharedFileRepo: ISharedFileRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
  ) {}

  async execute(input: MarkReadDoctorInput): Promise<void> {
    const patient = await this.patientRepo.findById(input.patientId, input.doctorId);
    if (!patient) {
      throw new PatientNotUnderDoctorError();
    }
    await this.sharedFileRepo.markReadByDoctor(input.doctorId, input.patientId);
  }
}
