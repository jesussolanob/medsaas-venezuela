import { Inject, Injectable } from '@nestjs/common';
import type { PendingConsultationPublicInfo } from '@delta/shared-types';
import {
  PENDING_CONSULTATION_REPOSITORY,
  type IPendingConsultationRepository,
} from '../../domain/repositories/pending-consultation.repository';
import { PendingConsultationInvalidTokenError } from '../../domain/errors/pending-consultation-invalid-token.error';
import { PendingConsultationTokenService } from '../services/pending-consultation-token.service';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../doctor-settings/domain/repositories/doctor-profile.repository';

/**
 * GetPendingConsultationByTokenUseCase
 *
 * Validates a HMAC token and returns safe public info about the pending
 * consultation — enough for the patient to see what they are scheduling.
 *
 * SECURITY:
 *   - Token verified before any DB access.
 *   - Returns only: plan_name, session_number, expires_at, is_schedulable, doctor_name.
 *   - No PII (no cedula, no email, no patient ID, no internal appointment IDs).
 *   - Invalid tokens → 404 (anti-enumeration).
 */
@Injectable()
export class GetPendingConsultationByTokenUseCase {
  constructor(
    @Inject(PENDING_CONSULTATION_REPOSITORY)
    private readonly repo: IPendingConsultationRepository,
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly doctorProfileRepo: IDoctorProfileRepository,
    private readonly tokenService: PendingConsultationTokenService,
  ) {}

  async execute(token: string): Promise<PendingConsultationPublicInfo> {
    const pendingId = this.tokenService.verify(token);
    if (!pendingId) throw new PendingConsultationInvalidTokenError();

    const entity = await this.repo.findById(pendingId);
    if (!entity) throw new PendingConsultationInvalidTokenError();

    const doctorProfile = await this.doctorProfileRepo.findByDoctorId(entity.doctorId);
    const doctorName = doctorProfile?.fullName ?? 'Su especialista';

    return {
      doctor_id: entity.doctorId,
      plan_name: entity.planName,
      session_number: entity.sessionNumber,
      expires_at: entity.expiresAt?.toISOString() ?? null,
      is_schedulable: entity.isSchedulable(),
      doctor_name: doctorName,
    };
  }
}
