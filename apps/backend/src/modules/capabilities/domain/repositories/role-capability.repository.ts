import type { RoleCapability } from '../entities/role-capability.entity';

export const ROLE_CAPABILITY_REPOSITORY = 'ROLE_CAPABILITY_REPOSITORY';

/**
 * Contract for role_capabilities persistence.
 *
 * The application layer depends only on this interface — never on the Sequelize
 * implementation — keeping the domain layer infrastructure-free.
 */
export interface IRoleCapabilityRepository {
  /**
   * Returns all capability rows for a given role.
   * Used by ResolveCapabilitiesUseCase.
   */
  findByRole(role: string): Promise<RoleCapability[]>;

  /**
   * Returns every capability row across all roles.
   * Used by ListAllCapabilitiesUseCase (admin).
   */
  findAll(): Promise<RoleCapability[]>;

  /**
   * Creates or updates a single (role, moduleKey, action) row.
   * Uses ON CONFLICT (role, module_key, action) DO UPDATE semantics.
   * Returns the persisted entity.
   */
  upsert(
    role: string,
    moduleKey: string,
    action: string,
    allowed: boolean,
  ): Promise<RoleCapability>;
}
