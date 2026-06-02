import { Inject, Injectable } from '@nestjs/common';
import {
  PATIENT_PORTAL_REPOSITORY,
  type IPatientPortalRepository,
  type PatientMessageRow,
} from '../../../domain/repositories/patient-portal.repository';

export interface GetPatientMessagesInput {
  authUserId: string;
  /** Optionally filter to a conversation with a specific doctor. */
  doctorId?: string;
}

/**
 * Returns the authenticated patient's messages in chronological order.
 *
 * SECURITY: authUserId comes from DevAuthGuard (user.sub).
 * The lookup chain: authUserId → patient_id(s) → patient_messages.
 * Only messages for patient_id(s) belonging to this authUserId are returned.
 */
@Injectable()
export class GetPatientMessagesUseCase {
  constructor(
    @Inject(PATIENT_PORTAL_REPOSITORY)
    private readonly portalRepo: IPatientPortalRepository,
  ) {}

  async execute(input: GetPatientMessagesInput): Promise<PatientMessageRow[]> {
    const patientIds = await this.portalRepo.findPatientIdsByAuthUserId(input.authUserId);
    if (patientIds.length === 0) return [];
    return this.portalRepo.listMessages(patientIds, input.doctorId);
  }
}
