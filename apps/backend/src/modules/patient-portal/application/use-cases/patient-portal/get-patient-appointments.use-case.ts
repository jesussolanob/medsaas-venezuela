import { Inject, Injectable } from '@nestjs/common';
import {
  PATIENT_PORTAL_REPOSITORY,
  type IPatientPortalRepository,
  type PatientAppointmentsResult,
} from '../../../domain/repositories/patient-portal.repository';

export interface GetPatientAppointmentsInput {
  authUserId: string;
  page: number;
  limit: number;
}

/**
 * Lists the authenticated patient's appointments, newest first, paginated.
 *
 * SECURITY: authUserId comes from DevAuthGuard (user.sub). The repository
 * filters strictly by auth_user_id — no cross-patient leakage is possible.
 */
@Injectable()
export class GetPatientAppointmentsUseCase {
  constructor(
    @Inject(PATIENT_PORTAL_REPOSITORY)
    private readonly portalRepo: IPatientPortalRepository,
  ) {}

  async execute(input: GetPatientAppointmentsInput): Promise<PatientAppointmentsResult> {
    return this.portalRepo.listAppointments(input.authUserId, input.page, input.limit);
  }
}
