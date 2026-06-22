import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
} from '../../../domain/repositories/admin.repository';
import { DoctorNotFoundError } from '../../../domain/errors/doctor-not-found.error';
import { CannotBlockSuperAdminError } from '../../../domain/errors/cannot-block-super-admin.error';
import { CannotBlockSelfError } from '../../../domain/errors/cannot-block-self.error';

export interface SetDoctorAccessInput {
  targetId: string;
  actorId: string;
  isActive: boolean;
  reason?: string;
}

export interface SetDoctorAccessOutput {
  id: string;
  isActive: boolean;
}

/**
 * Sets profiles.is_active for a doctor profile (hard account ban / unban).
 *
 * Business rules:
 *  1. Target profile must exist.
 *  2. Cannot block a super_admin profile (prevents privilege-based lockout).
 *  3. Cannot block one's own account (prevents self-induced admin lockout).
 *
 * The reason param is accepted for audit / logging purposes but not persisted
 * unless an audit log table exists. It is included in the input so the caller
 * (controller) can log it or forward it to a future audit log without changing
 * the use-case signature.
 */
@Injectable()
export class SetDoctorAccessUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: IAdminRepository,
  ) {}

  async execute(input: SetDoctorAccessInput): Promise<SetDoctorAccessOutput> {
    const { targetId, actorId, isActive } = input;

    // 1. Target must exist
    const target = await this.adminRepo.findProfileById(targetId);
    if (!target) throw new DoctorNotFoundError(targetId);

    // 2. Cannot block a super_admin — only applies when blocking (isActive = false)
    if (!isActive && target.role === 'super_admin') {
      throw new CannotBlockSuperAdminError();
    }

    // 3. Cannot block oneself
    if (!isActive && targetId === actorId) {
      throw new CannotBlockSelfError();
    }

    const updated = await this.adminRepo.setProfileActive(targetId, isActive);

    return { id: targetId, isActive: updated };
  }
}
