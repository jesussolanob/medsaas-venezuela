import { randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  SHARED_FILE_REPOSITORY,
  type ISharedFileRepository,
} from '../../../domain/repositories/shared-file.repository';
import { SharedFile } from '../../../domain/entities/shared-file.entity';
import { SharedFileNotFoundError } from '../../../domain/errors/shared-file-not-found.error';
import type { CreateSharedFilePatientDto } from '../../dtos/shared-file.dto';
import type { IPatientPortalRepository } from '../../../../patient-portal/domain/repositories/patient-portal.repository';
import { PATIENT_PORTAL_REPOSITORY } from '../../../../patient-portal/domain/repositories/patient-portal.repository';

export interface CreateSharedFilePatientInput extends CreateSharedFilePatientDto {
  authUserId: string;
}

/**
 * Creates a shared file (reply / comment / upload) on behalf of an authenticated
 * patient. Resolves the patient record from authUserId and derives doctorId from it.
 *
 * SECURITY:
 *   - authUserId comes from user.sub (guard), never from the request body.
 *   - patientId and doctorId are resolved from the DB — never trusted from input.
 *   - read_by_patient = true  (patient created it — already seen).
 *   - read_by_doctor  = false (doctor has not seen it yet).
 */
@Injectable()
export class CreateSharedFilePatientUseCase {
  constructor(
    @Inject(SHARED_FILE_REPOSITORY)
    private readonly sharedFileRepo: ISharedFileRepository,
    @Inject(PATIENT_PORTAL_REPOSITORY)
    private readonly portalRepo: IPatientPortalRepository,
  ) {}

  async execute(input: CreateSharedFilePatientInput): Promise<SharedFile> {
    // 1. Resolve patient record from auth identity
    const patients = await this.portalRepo.findPatientsByAuthUserId(input.authUserId);
    const patient = patients[0];
    if (!patient) {
      throw new SharedFileNotFoundError();
    }
    // Use the first patient record (most recent by doctor — patients belong to one
    // doctor per record; we take the first as the primary relationship).

    // 2. Build and persist
    const sf = SharedFile.create({
      id: randomUUID(),
      doctorId: patient.doctorId,
      patientId: patient.id,
      title: input.title,
      description: input.description ?? null,
      filePath: input.filePath ?? null,
      fileType: input.fileType ?? null,
      fileSizeBytes: input.fileSizeBytes ?? null,
      category: input.category,
      status: 'pending',
      createdBy: 'patient',
      parentTaskId: input.parentTaskId ?? null,
      readByDoctor: false,
      readByPatient: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return this.sharedFileRepo.save(sf);
  }
}
