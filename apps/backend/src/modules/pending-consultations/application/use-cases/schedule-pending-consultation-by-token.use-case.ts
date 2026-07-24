import { Injectable } from '@nestjs/common';
import type { PendingConsultation } from '../../domain/entities/pending-consultation.entity';
import { PendingConsultationInvalidTokenError } from '../../domain/errors/pending-consultation-invalid-token.error';
import { PendingConsultationTokenService } from '../services/pending-consultation-token.service';
import { SchedulePendingConsultationUseCase } from './schedule-pending-consultation.use-case';

export interface SchedulePendingConsultationByTokenInput {
  token: string;
  scheduledAt: Date;
  officeId?: string | null;
  appointmentMode?: string | null;
}

/**
 * SchedulePendingConsultationByTokenUseCase
 *
 * Public (patient-facing) version of the scheduling use case.
 * Validates the HMAC token, resolves the pending consultation ID, and
 * delegates scheduling to SchedulePendingConsultationUseCase without a
 * doctorId scope (the token already authenticates the caller's intent).
 *
 * SECURITY:
 *   - Authenticated entirely by the HMAC token (no auth session required).
 *   - Token verification → 404 on failure (anti-enumeration).
 *   - All downstream checks (schedulable, overlap) are enforced by the
 *     SchedulePendingConsultationUseCase delegate.
 */
@Injectable()
export class SchedulePendingConsultationByTokenUseCase {
  constructor(
    private readonly tokenService: PendingConsultationTokenService,
    private readonly scheduleUC: SchedulePendingConsultationUseCase,
  ) {}

  async execute(input: SchedulePendingConsultationByTokenInput): Promise<PendingConsultation> {
    const pendingId = this.tokenService.verify(input.token);
    if (!pendingId) throw new PendingConsultationInvalidTokenError();

    // Delegate to the core use case without doctorId scope (token auth).
    return this.scheduleUC.execute({
      id: pendingId,
      scheduledAt: input.scheduledAt,
      officeId: input.officeId,
      appointmentMode: input.appointmentMode,
    });
  }
}
