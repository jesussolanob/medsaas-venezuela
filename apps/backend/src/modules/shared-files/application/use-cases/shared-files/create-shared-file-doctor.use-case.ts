import { randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  SHARED_FILE_REPOSITORY,
  type ISharedFileRepository,
} from '../../../domain/repositories/shared-file.repository';
import { SharedFile } from '../../../domain/entities/shared-file.entity';
import { PatientNotUnderDoctorError } from '../../../domain/errors/patient-not-under-doctor.error';
import type { CreateSharedFileDoctorDto } from '../../dtos/shared-file.dto';
import { PATIENT_REPOSITORY } from '../../../../patients/domain/repositories/patient.repository';
import type { IPatientRepository } from '../../../../patients/domain/repositories/patient.repository';

export interface CreateSharedFileDoctorInput extends CreateSharedFileDoctorDto {
  doctorId: string;
}

/**
 * Creates a shared file (task / instruction / comment / file) on behalf of
 * a doctor. Validates patient ownership before persisting.
 *
 * SECURITY:
 *   - doctorId is always taken from user.sub — never from the request body.
 *   - Validates patient.doctorId === doctorId to prevent cross-doctor IDOR.
 *   - read_by_doctor = true  (the doctor created it — already seen).
 *   - read_by_patient = false (patient has not seen it yet).
 */
@Injectable()
export class CreateSharedFileDoctorUseCase {
  constructor(
    @Inject(SHARED_FILE_REPOSITORY)
    private readonly sharedFileRepo: ISharedFileRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
  ) {}

  async execute(input: CreateSharedFileDoctorInput): Promise<SharedFile> {
    // 1. Validate patient ownership (anti-IDOR)
    const patient = await this.patientRepo.findById(input.patientId, input.doctorId);
    if (!patient) {
      throw new PatientNotUnderDoctorError();
    }

    // 2. Build domain entity
    const sf = SharedFile.create({
      id: randomUUID(),
      doctorId: input.doctorId,
      patientId: input.patientId,
      title: input.title,
      description: input.description ?? null,
      filePath: input.filePath ?? null,
      fileType: input.fileType ?? null,
      fileSizeBytes: input.fileSizeBytes ?? null,
      category: input.category,
      status: 'pending',
      createdBy: 'doctor',
      parentTaskId: input.parentTaskId ?? null,
      readByDoctor: true,
      readByPatient: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 3. Persist and return
    return this.sharedFileRepo.save(sf);
  }
}
