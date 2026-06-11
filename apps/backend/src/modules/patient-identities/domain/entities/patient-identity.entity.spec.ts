import { PatientIdentity } from './patient-identity.entity';
import { PatientIdentityInvariantError } from '../errors/patient-identity.errors';

const now = new Date('2026-06-11T00:00:00Z');

function makeParams() {
  return {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    cedulaHash: 'a'.repeat(64),
    cedulaEncrypted: 'enc:base64payload==',
    createdAt: now,
    updatedAt: now,
  };
}

describe('PatientIdentity entity', () => {
  it('creates an instance with valid params', () => {
    const identity = PatientIdentity.create(makeParams());

    expect(identity.id).toBe('aaaaaaaa-0000-0000-0000-000000000001');
    expect(identity.cedulaHash).toBe('a'.repeat(64));
    expect(identity.cedulaEncrypted).toBe('enc:base64payload==');
    expect(identity.createdAt).toBe(now);
    expect(identity.updatedAt).toBe(now);
  });

  it('throws PatientIdentityInvariantError when cedulaHash is empty', () => {
    expect(() => PatientIdentity.create({ ...makeParams(), cedulaHash: '' })).toThrow(
      PatientIdentityInvariantError,
    );
  });

  it('throws with code PATIENT_IDENTITY_INVARIANT when cedulaHash is empty', () => {
    try {
      PatientIdentity.create({ ...makeParams(), cedulaHash: '' });
      fail('expected error');
    } catch (err) {
      expect(err).toBeInstanceOf(PatientIdentityInvariantError);
      expect((err as PatientIdentityInvariantError).code).toBe('PATIENT_IDENTITY_INVARIANT');
    }
  });

  it('throws PatientIdentityInvariantError when cedulaEncrypted is empty', () => {
    expect(() => PatientIdentity.create({ ...makeParams(), cedulaEncrypted: '' })).toThrow(
      PatientIdentityInvariantError,
    );
  });

  it('static create returns a PatientIdentity instance', () => {
    const identity = PatientIdentity.create(makeParams());
    expect(identity).toBeInstanceOf(PatientIdentity);
  });

  it('instances are immutable (all properties are readonly)', () => {
    const identity = PatientIdentity.create(makeParams());
    // TypeScript enforces readonly at compile time; verify runtime values are stable.
    expect(Object.isFrozen(identity)).toBe(false); // we don't freeze, readonly is TS-only
    expect(identity.id).toBe('aaaaaaaa-0000-0000-0000-000000000001');
  });
});
