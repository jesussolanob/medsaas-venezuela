/**
 * RoleCapability domain entity.
 *
 * Represents a single (role, moduleKey, action) permission row.
 * No imports from NestJS, Sequelize, or any external library — pure domain logic.
 */
export type CapabilityAction = 'view' | 'create' | 'edit' | 'delete';

export interface RoleCapabilityProps {
  id: string;
  role: string;
  moduleKey: string;
  action: CapabilityAction;
  allowed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class RoleCapability {
  readonly id: string;
  readonly role: string;
  readonly moduleKey: string;
  readonly action: CapabilityAction;
  readonly allowed: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: RoleCapabilityProps) {
    this.id = props.id;
    this.role = props.role;
    this.moduleKey = props.moduleKey;
    this.action = props.action;
    this.allowed = props.allowed;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /** Returns a new entity with the allowed flag toggled (immutable update). */
  withAllowed(allowed: boolean): RoleCapability {
    return new RoleCapability({ ...this.toProps(), allowed, updatedAt: new Date() });
  }

  private toProps(): RoleCapabilityProps {
    return {
      id: this.id,
      role: this.role,
      moduleKey: this.moduleKey,
      action: this.action,
      allowed: this.allowed,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

/**
 * Aggregated capability map for a single role.
 * Shape: { [moduleKey]: { view, create, edit, delete } }
 * Default-deny: missing entries are false.
 */
export type ModuleCapabilityMap = Record<
  string,
  { view: boolean; create: boolean; edit: boolean; delete: boolean }
>;

/** Builds a default-deny capability map from a flat list of rows. */
export function buildCapabilityMap(rows: RoleCapability[]): ModuleCapabilityMap {
  const map: ModuleCapabilityMap = {};

  for (const row of rows) {
    if (!map[row.moduleKey]) {
      map[row.moduleKey] = { view: false, create: false, edit: false, delete: false };
    }
    map[row.moduleKey]![row.action] = row.allowed;
  }

  return map;
}
