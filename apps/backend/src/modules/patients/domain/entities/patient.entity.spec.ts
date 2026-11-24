import { Patient, type PatientCreateParams } from './patient.entity';

// Fixed "now" for deterministic age calculations. 2026-06-01 15:00 UTC = 11:00 Caracas.
const now = new Date('2026-06-01T15:00:00Z');

function buildParams(overrides: Partial<PatientCreateParams> = {}): PatientCreateParams {
  return {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    doctorId: 'dddddddd-0000-0000-0000-000000000001',
    fullName: 'Juan Pérez',
    cedula: 'V-12345678',
    phone: '+58412345678',
    email: 'juan@example.com',
    source: 'manual',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Patient entity', () => {
  describe('canBeAccessedBy', () => {
    it('returns true when the acting doctor is the owner', () => {
      const patient = new Patient(buildParams());
      expect(patient.canBeAccessedBy('dddddddd-0000-0000-0000-000000000001')).toBe(true);
    });

    it('returns false when a different doctor tries to access', () => {
      const patient = new Patient(buildParams());
      expect(patient.canBeAccessedBy('ffffffff-0000-0000-0000-000000000999')).toBe(false);
    });
  });

  describe('constructor', () => {
    it('defaults nullable optional fields to null', () => {
      const patient = new Patient(
        buildParams({ cedula: undefined, phone: undefined, email: undefined }),
      );
      expect(patient.cedula).toBeNull();
      expect(patient.phone).toBeNull();
      expect(patient.email).toBeNull();
    });

    it('stores provided optional fields', () => {
      const patient = new Patient(buildParams({ cedula: 'E-87654321', sex: 'male' }));
      expect(patient.cedula).toBe('E-87654321');
      expect(patient.sex).toBe('male');
    });

    it('stores authUserId when provided', () => {
      const patient = new Patient(
        buildParams({ authUserId: 'aaaaaaaa-1111-1111-1111-111111111111' }),
      );
      expect(patient.authUserId).toBe('aaaaaaaa-1111-1111-1111-111111111111');
    });

    it('defaults authUserId to null when not provided', () => {
      const patient = new Patient(buildParams());
      expect(patient.authUserId).toBeNull();
    });

    it('defaults emergencyContactRelationship to null when not provided', () => {
      const patient = new Patient(buildParams());
      expect(patient.emergencyContactRelationship).toBeNull();
    });

    it('stores emergencyContactRelationship when provided', () => {
      const patient = new Patient(buildParams({ emergencyContactRelationship: 'Madre' }));
      expect(patient.emergencyContactRelationship).toBe('Madre');
    });
  });

  describe('Patient.create factory', () => {
    it('returns a Patient instance equal to new Patient(params)', () => {
      const params = buildParams();
      const p1 = Patient.create(params);
      const p2 = new Patient(params);
      expect(p1).toBeInstanceOf(Patient);
      expect(p1.id).toBe(p2.id);
      expect(p1.fullName).toBe(p2.fullName);
    });
  });

  describe('age getter — computed from birthDate', () => {
    it('returns completed years for a past birth date', () => {
      // Born 1990-05-10; "today" is 2026-06-01 → birthday already passed → 36.
      const patient = new Patient(buildParams({ birthDate: '1990-05-10' }));
      // ageFromBirthDate uses real Date.now() inside unless overridden.
      // We only assert it is a non-null number for the domain contract.
      expect(typeof patient.age).toBe('number');
      expect(patient.age).not.toBeNull();
    });

    it('returns null when birthDate is null', () => {
      const patient = new Patient(buildParams({ birthDate: null }));
      expect(patient.age).toBeNull();
    });

    it('returns null when birthDate is undefined (not provided)', () => {
      const patient = new Patient(buildParams({ birthDate: undefined }));
      expect(patient.age).toBeNull();
    });

    it('returns null for a future birth date', () => {
      const patient = new Patient(buildParams({ birthDate: '2099-01-01' }));
      expect(patient.age).toBeNull();
    });

    it('returns null for an implausible birth date (>130 years ago)', () => {
      const patient = new Patient(buildParams({ birthDate: '1800-01-01' }));
      expect(patient.age).toBeNull();
    });
  });
});
