import { Identity } from './identity.entity';

const BASE_PARAMS = {
  id: 'aaaa1111-0000-0000-0000-000000000001',
  email: 'doc@example.com',
  fullName: 'Dr. Test',
  role: 'doctor',
  auth0Sub: 'auth0|abc123',
  createdAt: new Date('2026-06-08T00:00:00Z'),
};

describe('Identity entity', () => {
  it('constructs with all fields', () => {
    const identity = Identity.create(BASE_PARAMS);
    expect(identity.id).toBe(BASE_PARAMS.id);
    expect(identity.email).toBe(BASE_PARAMS.email);
    expect(identity.fullName).toBe(BASE_PARAMS.fullName);
    expect(identity.role).toBe('doctor');
    expect(identity.auth0Sub).toBe('auth0|abc123');
    expect(identity.createdAt).toEqual(BASE_PARAMS.createdAt);
  });

  it('constructs with null auth0Sub', () => {
    const identity = Identity.create({ ...BASE_PARAMS, auth0Sub: null });
    expect(identity.auth0Sub).toBeNull();
  });

  it('isSuperAdmin returns false for doctor', () => {
    const identity = Identity.create(BASE_PARAMS);
    expect(identity.isSuperAdmin()).toBe(false);
  });

  it('isSuperAdmin returns true for super_admin', () => {
    const identity = Identity.create({ ...BASE_PARAMS, role: 'super_admin' });
    expect(identity.isSuperAdmin()).toBe(true);
  });

  it('effectiveRole returns the assigned role', () => {
    const identity = Identity.create(BASE_PARAMS);
    expect(identity.effectiveRole).toBe('doctor');
  });

  it('effectiveRole returns super_admin for super_admin role', () => {
    const identity = Identity.create({ ...BASE_PARAMS, role: 'super_admin' });
    expect(identity.effectiveRole).toBe('super_admin');
  });
});
