import { Inject, Injectable } from '@nestjs/common';
import {
  ROLE_CAPABILITY_REPOSITORY,
  type IRoleCapabilityRepository,
} from '../../../domain/repositories/role-capability.repository';
import type { RoleCapability } from '../../../domain/entities/role-capability.entity';

export type CapabilitiesByRole = Record<string, RoleCapability[]>;

/**
 * Returns all capability rows from role_capabilities grouped by role.
 *
 * Intended for super_admin use only — all roles and their permission rows are
 * returned so the admin can review and modify them.
 */
@Injectable()
export class ListAllCapabilitiesUseCase {
  constructor(
    @Inject(ROLE_CAPABILITY_REPOSITORY)
    private readonly capabilityRepo: IRoleCapabilityRepository,
  ) {}

  async execute(): Promise<CapabilitiesByRole> {
    const rows = await this.capabilityRepo.findAll();

    const grouped: CapabilitiesByRole = {};
    for (const row of rows) {
      if (!grouped[row.role]) {
        grouped[row.role] = [];
      }
      grouped[row.role]!.push(row);
    }

    return grouped;
  }
}
