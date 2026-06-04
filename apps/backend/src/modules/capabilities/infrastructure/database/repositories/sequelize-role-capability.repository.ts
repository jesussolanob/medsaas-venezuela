import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import {
  RoleCapability,
  type CapabilityAction,
} from '../../../domain/entities/role-capability.entity';
import type { IRoleCapabilityRepository } from '../../../domain/repositories/role-capability.repository';
import { RoleCapabilityModel } from '../models/role-capability.model';

/**
 * Sequelize implementation of IRoleCapabilityRepository.
 *
 * The upsert method uses a raw parameterized query with
 * ON CONFLICT (role, module_key, action) DO UPDATE to guarantee atomicity.
 */
@Injectable()
export class SequelizeRoleCapabilityRepository implements IRoleCapabilityRepository {
  constructor(
    @InjectModel(RoleCapabilityModel)
    private readonly model: typeof RoleCapabilityModel,
  ) {}

  async findByRole(role: string): Promise<RoleCapability[]> {
    const rows = await this.model.findAll({ where: { role } });
    return rows.map((r) => this.toDomain(r));
  }

  async findAll(): Promise<RoleCapability[]> {
    const rows = await this.model.findAll({
      order: [
        ['role', 'ASC'],
        ['moduleKey', 'ASC'],
        ['action', 'ASC'],
      ],
    });
    return rows.map((r) => this.toDomain(r));
  }

  async upsert(
    role: string,
    moduleKey: string,
    action: string,
    allowed: boolean,
  ): Promise<RoleCapability> {
    const sequelize = this.model.sequelize!;

    // Use raw query for reliable ON CONFLICT DO UPDATE with uuid_generate_v4()
    const rows = await sequelize.query<{
      id: string;
      role: string;
      module_key: string;
      action: string;
      allowed: boolean;
      created_at: string;
      updated_at: string;
    }>(
      `
      INSERT INTO role_capabilities (id, role, module_key, action, allowed, created_at, updated_at)
      VALUES (uuid_generate_v4(), :role, :moduleKey, :action, :allowed, now(), now())
      ON CONFLICT (role, module_key, action)
      DO UPDATE SET allowed = EXCLUDED.allowed, updated_at = now()
      RETURNING id, role, module_key, action, allowed, created_at, updated_at
      `,
      {
        replacements: { role, moduleKey, action, allowed },
        type: QueryTypes.SELECT,
      },
    );

    // rows[0] is guaranteed to exist after a successful RETURNING upsert
    const row = rows[0]!;
    return new RoleCapability({
      id: row.id,
      role: row.role,
      moduleKey: row.module_key,
      action: row.action as CapabilityAction,
      allowed: row.allowed,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toDomain(row: RoleCapabilityModel): RoleCapability {
    return new RoleCapability({
      id: row.id,
      role: row.role,
      moduleKey: row.moduleKey,
      action: row.action as CapabilityAction,
      allowed: row.allowed,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
