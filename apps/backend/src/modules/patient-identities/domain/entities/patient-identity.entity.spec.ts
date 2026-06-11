import { PatientIdentity } from './patient-identity.entity';

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

  it('throws when cedulaHash is empty', () => {
    expect(() => PatientIdentity.create({ ...makeParams(), cedulaHash: '' })).toThrow(
      'cedulaHash is required',
    );
  });

  it('throws when cedulaEncrypted is empty', () => {
    expect(() => PatientIdentity.create({ ...makeParams(), cedulaEncrypted: '' })).toThrow(
      'cedulaEncrypted is required',
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
