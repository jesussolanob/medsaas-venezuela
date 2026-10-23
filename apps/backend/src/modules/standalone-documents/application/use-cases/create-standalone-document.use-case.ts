import { Inject, Injectable } from '@nestjs/common';
import type { CreateStandaloneDocumentDto } from '@delta/shared-types';
import {
  STANDALONE_DOCUMENT_REPOSITORY,
  type IStandaloneDocumentRepository,
} from '../../domain/repositories/istandalone-document.repository';
import type { StandaloneDocument } from '../../domain/entities/standalone-document.entity';
import { PatientNotOwnedByDoctorError } from '../../domain/errors/patient-not-owned-by-doctor.error';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../patients/domain/repositories/patient.repository';

/**
 * CreateStandaloneDocumentUseCase — creates a new draft document.
 *
 * Anti-IDOR: verifies the patient belongs to the doctor before creating.
 * The patient is fetched scoped to doctorId (findById returns null for
 * foreign patients).
 */
@Injectable()
export class CreateStandaloneDocumentUseCase {
  constructor(
    @Inject(STANDALONE_DOCUMENT_REPOSITORY)
    private readonly repo: IStandaloneDocumentRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
  ) {}

  async execute(dto: CreateStandaloneDocumentDto, doctorId: string): Promise<StandaloneDocument> {
    // Verify patient ownership (anti-IDOR)
    const patient = await this.patientRepo.findById(dto.patient_id, doctorId);
    if (!patient) {
      throw new PatientNotOwnedByDoctorError();
    }

    return this.repo.create({
      doctorId,
      patientId: dto.patient_id,
      type: dto.type,
      content: dto.content as Record<string, unknown>,
    });
  }
}
