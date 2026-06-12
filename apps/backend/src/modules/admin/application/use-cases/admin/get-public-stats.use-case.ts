import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
  type PublicStats,
} from '../../../domain/repositories/admin.repository';

export type { PublicStats };

/**
 * Returns aggregate counts for the public landing page counter.
 *
 * SECURITY CONTRACT:
 *   - No PII — only integer counts.
 *   - No authentication required (used by unauthenticated landing visitors).
 *   - specialists: count of verified doctors (or all doctors if none are verified).
 *   - patients: total patient count.
 */
@Injectable()
export class GetPublicStatsUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: IAdminRepository,
  ) {}

  async execute(): Promise<PublicStats> {
    return this.adminRepo.getPublicStats();
  }
}
