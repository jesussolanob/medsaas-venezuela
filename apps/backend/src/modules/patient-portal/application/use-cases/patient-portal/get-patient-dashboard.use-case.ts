import { Inject, Injectable } from '@nestjs/common';
import { PatientDashboard } from '../../../domain/entities/patient-dashboard.entity';
import {
  PATIENT_PORTAL_REPOSITORY,
  type IPatientPortalRepository,
} from '../../../domain/repositories/patient-portal.repository';

export interface GetPatientDashboardInput {
  authUserId: string;
}

/**
 * Assembles the patient's dashboard from three independent queries:
 *   1. Next upcoming appointment (scheduled/confirmed, future)
 *   2. Active packages with doctor info
 *   3. Total appointment count (all statuses)
 *
 * SECURITY: authUserId comes from DevAuthGuard (user.sub) — never from client input.
 * All queries are scoped to this authUserId in the repository layer.
 */
@Injectable()
export class GetPatientDashboardUseCase {
  constructor(
    @Inject(PATIENT_PORTAL_REPOSITORY)
    private readonly portalRepo: IPatientPortalRepository,
  ) {}

  async execute(input: GetPatientDashboardInput): Promise<PatientDashboard> {
    const [nextAppointment, activePackages, totalAppointments] = await Promise.all([
      this.portalRepo.findNextAppointment(input.authUserId),
      this.portalRepo.findActivePackages(input.authUserId),
      this.portalRepo.countAppointments(input.authUserId),
    ]);

    return new PatientDashboard(nextAppointment, activePackages, totalAppointments);
  }
}
