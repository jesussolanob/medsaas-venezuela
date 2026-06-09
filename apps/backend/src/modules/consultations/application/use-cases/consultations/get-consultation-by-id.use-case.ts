import { Inject, Injectable } from '@nestjs/common';
import { Consultation } from '../../../domain/entities/consultation.entity';
import { ConsultationNotFoundError } from '../../../domain/errors/consultation-not-found.error';
import {
  IConsultationRepository,
  CONSULTATION_REPOSITORY,
} from '../../../domain/repositories/consultation.repository';

export interface GetConsultationByIdInput {
  consultationId: string;
  doctorId: string;
}

/**
 * Retrieves a single consultation by ID, scoped to the authenticated doctor.
 *
 * Returns clinical data in plaintext — the decryption boundary is the repository.
 * Ownership is enforced at the query level (doctor_id in WHERE clause).
 *
 * TODO (before production): log PHI access to access_audit_log.
 * Record: actor_id, patient_id, resource_type='consultation', action='read', consultation_id.
 * See GetPatientUseCase (patients module) for the reference audit pattern.
 */
@Injectable()
export class GetConsultationByIdUseCase {
  constructor(
    @Inject(CONSULTATION_REPOSITORY)
    private readonly repo: IConsultationRepository,
  ) {}

  async execute(input: GetConsultationByIdInput): Promise<Consultation> {
    const consultation = await this.repo.findById(input.consultationId, input.doctorId);
    if (!consultation) {
      throw new ConsultationNotFoundError();
    }
    return consultation;
  }
}
