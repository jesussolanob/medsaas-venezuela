import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { AuthProfileModel } from '../../modules/auth/infrastructure/database/models/auth-profile.model';
import type { IAccountStatusPort } from './account-status.port';

/**
 * Sequelize implementation of IAccountStatusPort.
 *
 * Issues a lightweight SELECT on the profiles table (single column, single row)
 * to read the is_active flag. No Redis — REDIS_DISABLED=true in prod; one DB
 * round-trip per authenticated request is consistent with the existing RBAC pattern.
 *
 * Null-treatment: NULL is treated as active (all existing profiles are active
 * and the column is nullable). Only an explicit false blocks the account.
 */
@Injectable()
export class SequelizeAccountStatusAdapter implements IAccountStatusPort {
  constructor(
    @InjectModel(AuthProfileModel)
    private readonly profileModel: typeof AuthProfileModel,
  ) {}

  async isActive(profileId: string): Promise<boolean> {
    const profile = await this.profileModel.findOne({
      where: { id: profileId },
      attributes: ['isActive'],
      raw: true,
    });

    if (!profile) {
      // Profile not found — fail open; identity resolver will raise the error.
      return true;
    }

    // Treat null as active; only explicit false means blocked.
    return (profile as unknown as { isActive: boolean | null }).isActive !== false;
  }
}
