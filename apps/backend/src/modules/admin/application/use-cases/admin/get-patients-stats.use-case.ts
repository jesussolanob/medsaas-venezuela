import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
  type PatientStats,
} from '../../../domain/repositories/admin.repository';

/**
 * Returns global patient statistics without any PII.
 *
 * Counts are aggregated by doctor. No patient names, cedulas, emails,
 * or phones are included in the output per the CLAUDE.md security rules.
 */
@Injectable()
export class GetPatientsStatsUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: IAdminRepository,
  ) {}

  async execute(): Promise<PatientStats> {
    return this.adminRepo.getPatientStats();
  }
}
