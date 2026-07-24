import { Inject, Injectable } from '@nestjs/common';
import type { PendingConsultationStatus } from '@delta/shared-types';
import type { PendingConsultation } from '../../domain/entities/pending-consultation.entity';
import {
  PENDING_CONSULTATION_REPOSITORY,
  type IPendingConsultationRepository,
} from '../../domain/repositories/pending-consultation.repository';

export interface GetDoctorPendingConsultationsInput {
  doctorId: string;
  status?: PendingConsultationStatus;
}

/**
 * Returns all pending consultations for the authenticated doctor.
 * Optionally filtered by status.
 *
 * SECURITY: doctorId always comes from the authenticated session token (user.sub),
 * never from the request body — cross-doctor access is structurally impossible.
 */
@Injectable()
export class GetDoctorPendingConsultationsUseCase {
  constructor(
    @Inject(PENDING_CONSULTATION_REPOSITORY)
    private readonly repo: IPendingConsultationRepository,
  ) {}

  async execute(input: GetDoctorPendingConsultationsInput): Promise<PendingConsultation[]> {
    return this.repo.findByDoctor({
      doctorId: input.doctorId,
      status: input.status,
    });
  }
}
