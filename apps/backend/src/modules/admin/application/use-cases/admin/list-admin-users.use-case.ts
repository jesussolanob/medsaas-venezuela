import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_REPOSITORY,
  type IAdminRepository,
  type AdminUserRow,
} from '../../../domain/repositories/admin.repository';

/**
 * Returns all profiles with role 'super_admin'.
 *
 * NOTE: this returns PII (full_name, email). The use case is admin-only
 * and must never be reused in non-super_admin contexts.
 */
@Injectable()
export class ListAdminUsersUseCase {
  constructor(
    @Inject(ADMIN_REPOSITORY)
    private readonly adminRepo: IAdminRepository,
  ) {}

  async execute(): Promise<AdminUserRow[]> {
    return this.adminRepo.listAdminUsers();
  }
}
