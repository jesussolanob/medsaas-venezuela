import { toPatientListItem, toPatientDetail, toPatientReveal } from './patient.mapper';
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
  describe('toPatientListItem — minimal list shape', () => {
    it('masks the full name to first-name + last-initial', () => {
      const item = toPatientListItem(makePatient());
      expect(item.fullName).toBe('Juan G.');
    });

    it('masks cédula keeping prefix and last 2 digits', () => {
      const item = toPatientListItem(makePatient());
      expect(item.cedula).toMatch(/^V-/);
      expect(item.cedula).toContain('***');
      expect(item.cedula).not.toContain('12345678');
    });

    it('masks phone with *** in the middle', () => {
      const item = toPatientListItem(makePatient());
      expect(item.phone).toContain('***');
      expect(item.phone).not.toBe('+58412345678');
    });

    it('masks email keeping first char + domain', () => {
      const item = toPatientListItem(makePatient());
      expect(item.email).toMatch(/^j\*\*\*@gmail\.com$/);
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

  describe('toPatientDetail — full masked detail shape', () => {
    it('masks PII fields', () => {
      const detail = toPatientDetail(makePatient());
      expect(detail.fullName).toBe('Juan G.');
      expect(detail.cedula).toContain('***');
      expect(detail.phone).toContain('***');
      expect(detail.email).toContain('***');
    });

    it('includes clinical fields', () => {
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
  });

  describe('toPatientReveal — plaintext for /reveal endpoint', () => {
    it('returns PII without masking', () => {
      const patient = makePatient();
      const revealed = toPatientReveal(patient);
      expect(revealed.fullName).toBe('Juan Pérez García');
      expect(revealed.cedula).toBe('V-12345678');
      expect(revealed.phone).toBe('+58412345678');
      expect(revealed.email).toBe('juan@gmail.com');
    });

    it('includes clinical fields in plaintext', () => {
      const revealed = toPatientReveal(makePatient());
      expect(revealed.allergies).toBe('Penicilina');
      expect(revealed.notes).toBe('Nota clínica');
    });
  });
});
