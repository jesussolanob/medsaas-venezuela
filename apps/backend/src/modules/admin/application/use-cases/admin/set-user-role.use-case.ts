import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
} from '../../../domain/repositories/admin.repository';
import { AdminUserNotFoundError } from '../../../domain/errors/admin-user-not-found.error';
import { LastSuperAdminError } from '../../../domain/errors/last-super-admin.error';

export interface SetUserRoleInput {
  targetUserId: string;
  actorUserId: string;
  newRole: string;
}

/**
 * Grants or revokes the super_admin role on a profile.
 *
 * Business rules enforced:
 *  1. Target user must exist.
 *  2. An actor cannot demote themselves.
 *  3. There must always be at least one super_admin remaining after the operation.
 *     (Only checked when demoting away from super_admin.)
 */
@Injectable()
export class SetUserRoleUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: IAdminRepository,
  ) {}

  async execute(input: SetUserRoleInput): Promise<void> {
    const { targetUserId, actorUserId, newRole } = input;

    // 1. Target must exist
    const target = await this.adminRepo.findProfileById(targetUserId);
    if (!target) throw new AdminUserNotFoundError(targetUserId);

    // 2. Self-demotion prevention
    if (targetUserId === actorUserId && newRole !== 'super_admin') {
      throw new LastSuperAdminError();
    }

    // 3. Last-super_admin guard (only when demoting an existing super_admin)
    if (target.role === 'super_admin' && newRole !== 'super_admin') {
      const count = await this.adminRepo.countSuperAdmins();
      if (count <= 1) {
        throw new LastSuperAdminError();
      }
    }

    await this.adminRepo.setUserRole(targetUserId, newRole);
  }
}
