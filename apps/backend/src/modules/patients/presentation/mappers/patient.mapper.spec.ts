import { toPatientListItem, toPatientDetail } from './patient.mapper';
import { Patient } from '../../domain/entities/patient.entity';

const now = new Date('2026-06-01T00:00:00Z');

function makePatient(overrides: Partial<ConstructorParameters<typeof Patient>[0]> = {}): Patient {
  return Patient.create({
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    doctorId: 'dddddddd-0000-0000-0000-000000000001',
    fullName: 'Juan Pérez García',
    cedula: 'V-12345678',
    phone: '+58412345678',
    email: 'juan@gmail.com',
    source: 'manual',
    allergies: 'Penicilina',
    chronicConditions: 'Diabetes',
    notes: 'Nota clínica',
    bloodType: 'O+',
    birthDate: '1990-01-01',
    address: 'Calle 1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('patient.mapper', () => {
  describe('toPatientListItem — minimal list shape, PII in plain', () => {
    it('returns full name without masking', () => {
      const item = toPatientListItem(makePatient());
      expect(item.fullName).toBe('Juan Pérez García');
      expect(item.fullName).not.toContain('***');
    });

    it('returns cédula in plain — no masking', () => {
      const item = toPatientListItem(makePatient());
      expect(item.cedula).toBe('V-12345678');
      expect(String(item.cedula)).not.toContain('***');
    });

    it('returns phone in plain — no masking', () => {
      const item = toPatientListItem(makePatient());
      expect(item.phone).toBe('+58412345678');
      expect(String(item.phone)).not.toContain('***');
    });

    it('returns email in plain — no masking', () => {
      const item = toPatientListItem(makePatient());
      expect(item.email).toBe('juan@gmail.com');
      expect(String(item.email)).not.toContain('***');
    });

    it('returns null for absent PII fields', () => {
      const item = toPatientListItem(makePatient({ cedula: null, phone: null, email: null }));
      expect(item.cedula).toBeNull();
      expect(item.phone).toBeNull();
      expect(item.email).toBeNull();
    });

    it('includes core identifiers and source', () => {
      const patient = makePatient();
      const item = toPatientListItem(patient);
      expect(item.id).toBe(patient.id);
      expect(item.doctorId).toBe(patient.doctorId);
      expect(item.source).toBe('manual');
      expect(item.createdAt).toBe(patient.createdAt);
    });

    it('EXCLUDES clinical fields — allergies, chronicConditions, notes, bloodType, birthDate, address', () => {
      const item = toPatientListItem(makePatient()) as unknown as Record<string, unknown>;
      expect(item).not.toHaveProperty('allergies');
      expect(item).not.toHaveProperty('chronicConditions');
      expect(item).not.toHaveProperty('notes');
      expect(item).not.toHaveProperty('bloodType');
      expect(item).not.toHaveProperty('birthDate');
      expect(item).not.toHaveProperty('address');
      expect(item).not.toHaveProperty('sex');
      expect(item).not.toHaveProperty('authUserId');
    });
  });

  describe('toPatientDetail — full detail shape, PII in plain', () => {
    it('returns PII fields without masking', () => {
      const detail = toPatientDetail(makePatient());
      expect(detail.fullName).toBe('Juan Pérez García');
      expect(detail.cedula).toBe('V-12345678');
      expect(detail.phone).toBe('+58412345678');
      expect(detail.email).toBe('juan@gmail.com');
      expect(String(detail.fullName)).not.toContain('***');
      expect(String(detail.cedula)).not.toContain('***');
      expect(String(detail.phone)).not.toContain('***');
      expect(String(detail.email)).not.toContain('***');
    });

    it('includes clinical fields in full', () => {
      const detail = toPatientDetail(makePatient());
      expect(detail.allergies).toBe('Penicilina');
      expect(detail.chronicConditions).toBe('Diabetes');
      expect(detail.notes).toBe('Nota clínica');
      expect(detail.bloodType).toBe('O+');
    });

    it('preserves non-PII fields unchanged', () => {
      const patient = makePatient({ source: 'booking' });
      const detail = toPatientDetail(patient);
      expect(detail.source).toBe('booking');
      expect(detail.id).toBe(patient.id);
    });

    it('returns null for absent PII fields', () => {
      const detail = toPatientDetail(makePatient({ cedula: null, phone: null, email: null }));
      expect(detail.cedula).toBeNull();
      expect(detail.phone).toBeNull();
      expect(detail.email).toBeNull();
    });

    it('includes timestamps', () => {
      const patient = makePatient();
      const detail = toPatientDetail(patient);
      expect(detail.createdAt).toBe(patient.createdAt);
      expect(detail.updatedAt).toBe(patient.updatedAt);
    });

    it('includes emergencyContactRelationship when set', () => {
      const patient = makePatient({ emergencyContactRelationship: 'Madre' });
      const detail = toPatientDetail(patient);
      expect(detail.emergencyContactRelationship).toBe('Madre');
    });

    it('returns null for emergencyContactRelationship when not set', () => {
      const detail = toPatientDetail(makePatient());
      expect(detail.emergencyContactRelationship).toBeNull();
    });
  });
});
