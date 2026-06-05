import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
  type RecentDoctorRow,
} from '../../../domain/repositories/admin.repository';

export interface GetRecentDoctorsInput {
  /** Number of days to look back. Clamped to [1, 30]. Default 7. */
  days?: number;
}

const MAX_DAYS = 30;
const DEFAULT_DAYS = 7;

/**
 * Returns doctors registered in the last N days (default 7, max 30).
 *
 * Used by the admin notification bell to surface newly joined doctors.
 * No caching: results are small and freshness matters for a notification feed.
 *
 * SECURITY: Output includes doctor full name + email (PII). Caller must be
 * super_admin-guarded.
 */
@Injectable()
export class GetRecentDoctorsUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: IAdminRepository,
  ) {}

  async execute(input: GetRecentDoctorsInput = {}): Promise<RecentDoctorRow[]> {
    const days = Math.min(MAX_DAYS, Math.max(1, input.days ?? DEFAULT_DAYS));
    return this.adminRepo.getRecentDoctors(days);
  }
}
