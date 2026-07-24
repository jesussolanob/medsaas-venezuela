import { Inject, Injectable } from '@nestjs/common';
import type { PendingConsultation } from '../../domain/entities/pending-consultation.entity';
import {
  PENDING_CONSULTATION_REPOSITORY,
  type IPendingConsultationRepository,
} from '../../domain/repositories/pending-consultation.repository';
import { PendingConsultationNotFoundError } from '../../domain/errors/pending-consultation-not-found.error';
import { PendingConsultationNotSchedulableError } from '../../domain/errors/pending-consultation-not-schedulable.error';

export interface CancelPendingConsultationInput {
  id: string;
  doctorId: string;
}

/**
 * CancelPendingConsultationUseCase
 *
 * Sets a pending consultation to 'cancelled'.
 * Only pending_scheduling consultations may be cancelled — already scheduled,
 * completed, expired, or cancelled rows are rejected with a domain error.
 *
 * SECURITY: doctorId is always taken from the authenticated session (user.sub).
 * findByIdAndDoctor enforces ownership anti-IDOR at the repo level.
 */
@Injectable()
export class CancelPendingConsultationUseCase {
  constructor(
    @Inject(PENDING_CONSULTATION_REPOSITORY)
    private readonly repo: IPendingConsultationRepository,
  ) {}

  async execute(input: CancelPendingConsultationInput): Promise<PendingConsultation> {
    const entity = await this.repo.findByIdAndDoctor(input.id, input.doctorId);
    if (!entity) throw new PendingConsultationNotFoundError(input.id);

    if (entity.status !== 'pending_scheduling') {
      throw new PendingConsultationNotSchedulableError(input.id);
    }

    const cancelled = entity.markCancelled();
    return this.repo.save(cancelled);
  }
}
