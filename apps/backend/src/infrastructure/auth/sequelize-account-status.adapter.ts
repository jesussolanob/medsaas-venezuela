import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { AuthProfileModel } from '../../modules/auth/infrastructure/database/models/auth-profile.model';
import type { AccountStatus, DeactivationOrigin, IAccountStatusPort } from './account-status.port';

/**
 * Sequelize implementation of IAccountStatusPort.
 *
 * Issues a lightweight SELECT on the profiles table (two columns, single row).
 * No Redis — REDIS_DISABLED=true in prod; one DB round-trip per authenticated
 * request is consistent with the existing RBAC pattern.
 *
 * Null-treatment: NULL is_active is treated as active (the column is nullable
 * and every pre-existing profile is live). Only an explicit false switches the
 * account off.
 */
@Injectable()
export class SequelizeAccountStatusAdapter implements IAccountStatusPort {
  constructor(
    @InjectModel(AuthProfileModel)
    private readonly profileModel: typeof AuthProfileModel,
  ) {}

  async getStatus(profileId: string): Promise<AccountStatus> {
    const profile = await this.profileModel.findOne({
      where: { id: profileId },
      attributes: ['isActive', 'deactivatedBy'],
      raw: true,
    });

    if (!profile) {
      // Profile not found — fail open; identity resolver will raise the error.
      return { isActive: true, deactivatedBy: null };
    }

    const row = profile as unknown as {
      isActive: boolean | null;
      deactivatedBy: string | null;
    };

    // Treat null as active; only explicit false switches the account off.
    const isActive = row.isActive !== false;

    if (isActive) {
      return { isActive: true, deactivatedBy: null };
    }

    // Anything outside the known vocabulary is reported as an admin action:
    // the CHECK constraint makes it unreachable, and defaulting to the stricter
    // "blocked" copy is the safe side of a wrong guess.
    const origin: DeactivationOrigin = row.deactivatedBy === 'self' ? 'self' : 'admin';

    return { isActive: false, deactivatedBy: origin };
  }
}
