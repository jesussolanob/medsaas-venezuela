import { Inject, Injectable } from '@nestjs/common';
import type { ConsultationListResult } from '../../../domain/repositories/consultation.repository';
import {
  IConsultationRepository,
  CONSULTATION_REPOSITORY,
} from '../../../domain/repositories/consultation.repository';

export interface GetPatientConsultationHistoryInput {
  patientId: string;
  doctorId: string;
  page: number;
  limit: number;
}

/**
 * Returns the consultation history for a given patient, scoped to the requesting doctor.
 *
 * Ownership is enforced at the repository query level — only consultations where
 * doctor_id = doctorId are returned. A doctor cannot see another doctor's consultations
 * for the same patient.
 *
 * Clinical data is returned in plaintext (decrypted by the repository layer).
 *
 * TODO (before production): log PHI access to access_audit_log.
 * Record one entry per bulk access: actor_id, patient_id, resource_type='consultation_history',
 * action='list'. See GetPatientUseCase (patients module) for the reference audit pattern.
 */
@Injectable()
export class GetPatientConsultationHistoryUseCase {
  constructor(
    @Inject(CONSULTATION_REPOSITORY)
    private readonly repo: IConsultationRepository,
  ) {}

  async execute(input: GetPatientConsultationHistoryInput): Promise<ConsultationListResult> {
    return this.repo.findByPatient(input.patientId, input.doctorId, input.page, input.limit);
  }
}
