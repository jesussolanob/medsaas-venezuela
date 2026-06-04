import {
  RoleCapability,
  buildCapabilityMap,
  type RoleCapabilityProps,
} from './role-capability.entity';

const makeProps = (overrides: Partial<RoleCapabilityProps> = {}): RoleCapabilityProps => ({
  id: 'uuid-1',
  role: 'doctor',
  moduleKey: 'agenda',
  action: 'view',
  allowed: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

describe('RoleCapability entity', () => {
  it('constructs with correct properties', () => {
    const entity = new RoleCapability(makeProps());
    expect(entity.id).toBe('uuid-1');
    expect(entity.role).toBe('doctor');
    expect(entity.moduleKey).toBe('agenda');
    expect(entity.action).toBe('view');
    expect(entity.allowed).toBe(true);
  });

  it('withAllowed returns a new entity with updated flag', () => {
    const original = new RoleCapability(makeProps({ allowed: true }));
    const toggled = original.withAllowed(false);

    expect(toggled.allowed).toBe(false);
    expect(toggled.id).toBe(original.id);
    expect(toggled.role).toBe(original.role);
    // Immutability: original is unchanged
    expect(original.allowed).toBe(true);
  });

  it('withAllowed sets a new updatedAt', () => {
    const original = new RoleCapability(makeProps({ updatedAt: new Date('2024-01-01') }));
    const before = Date.now();
    const toggled = original.withAllowed(false);
    const after = Date.now();

    expect(toggled.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(toggled.updatedAt.getTime()).toBeLessThanOrEqual(after);
  });
});

describe('buildCapabilityMap', () => {
  it('returns empty map for empty rows', () => {
    const map = buildCapabilityMap([]);
    expect(map).toEqual({});
  });

  it('correctly maps a single row', () => {
    const rows = [
      new RoleCapability(makeProps({ moduleKey: 'agenda', action: 'view', allowed: true })),
    ];
    const map = buildCapabilityMap(rows);

    expect(map['agenda']).toEqual({ view: true, create: false, edit: false, delete: false });
  });

  it('aggregates multiple actions for the same module', () => {
    const rows = [
      new RoleCapability(makeProps({ moduleKey: 'patients', action: 'view', allowed: true })),
      new RoleCapability(
        makeProps({ id: 'uuid-2', moduleKey: 'patients', action: 'create', allowed: true }),
      ),
      new RoleCapability(
        makeProps({ id: 'uuid-3', moduleKey: 'patients', action: 'edit', allowed: false }),
      ),
    ];
    const map = buildCapabilityMap(rows);

    expect(map['patients']).toEqual({ view: true, create: true, edit: false, delete: false });
  });

  it('handles multiple modules', () => {
    const rows = [
      new RoleCapability(makeProps({ moduleKey: 'agenda', action: 'view', allowed: true })),
      new RoleCapability(
        makeProps({ id: 'uuid-2', moduleKey: 'patients', action: 'view', allowed: true }),
      ),
    ];
    const map = buildCapabilityMap(rows);

    expect(Object.keys(map)).toHaveLength(2);
    expect(map['agenda']!.view).toBe(true);
    expect(map['patients']!.view).toBe(true);
  });

  it('default-deny: action not present in rows defaults to false', () => {
    const rows = [
      new RoleCapability(makeProps({ moduleKey: 'billing', action: 'view', allowed: true })),
    ];
    const map = buildCapabilityMap(rows);

    expect(map['billing']!.view).toBe(true);
    expect(map['billing']!.create).toBe(false);
    expect(map['billing']!.edit).toBe(false);
    expect(map['billing']!.delete).toBe(false);
  });

  it('later row overwrites earlier row for the same module+action', () => {
    const rows = [
      new RoleCapability(makeProps({ moduleKey: 'agenda', action: 'view', allowed: true })),
      new RoleCapability(
        makeProps({ id: 'uuid-2', moduleKey: 'agenda', action: 'view', allowed: false }),
      ),
    ];
    const map = buildCapabilityMap(rows);
    expect(map['agenda']!.view).toBe(false);
  });
});
