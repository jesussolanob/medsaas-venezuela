import { Prescription } from './prescription.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OTHER_DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000002';
const now = new Date('2026-06-01T00:00:00Z');

function makePrescription(
  overrides: Partial<ConstructorParameters<typeof Prescription>[0]> = {},
): Prescription {
  return Prescription.create({
    id: 'pppppppp-0000-0000-0000-000000000001',
    patientId: 'aaaaaaaa-0000-0000-0000-000000000001',
    doctorId: DOCTOR_ID,
    consultationId: null,
    medication: 'Metformin',
    dosage: '500mg',
    frequency: 'twice daily',
    duration: '30 days',
    notes: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('Prescription', () => {
  describe('canBeModifiedBy', () => {
    it('returns true for the owner doctor', () => {
      const prescription = makePrescription();
      expect(prescription.canBeModifiedBy(DOCTOR_ID)).toBe(true);
    });

    it('returns false for a different doctor', () => {
      const prescription = makePrescription();
      expect(prescription.canBeModifiedBy(OTHER_DOCTOR_ID)).toBe(false);
    });

    it('returns false for an empty string', () => {
      const prescription = makePrescription();
      expect(prescription.canBeModifiedBy('')).toBe(false);
    });
  });

  describe('create', () => {
    it('initializes all fields from params', () => {
      const prescription = makePrescription();
      expect(prescription.id).toBe('pppppppp-0000-0000-0000-000000000001');
      expect(prescription.doctorId).toBe(DOCTOR_ID);
      expect(prescription.medication).toBe('Metformin');
      expect(prescription.dosage).toBe('500mg');
      expect(prescription.frequency).toBe('twice daily');
      expect(prescription.duration).toBe('30 days');
      expect(prescription.notes).toBeNull();
    });

    it('defaults optional fields to null when not provided', () => {
      const prescription = Prescription.create({
        id: 'pppppppp-0000-0000-0000-000000000002',
        doctorId: DOCTOR_ID,
        medication: 'Aspirin',
        createdAt: now,
        updatedAt: now,
      });
      expect(prescription.patientId).toBeNull();
      expect(prescription.consultationId).toBeNull();
      expect(prescription.dosage).toBeNull();
      expect(prescription.frequency).toBeNull();
      expect(prescription.duration).toBeNull();
      expect(prescription.notes).toBeNull();
    });

    it('accepts a patientId when provided', () => {
      const patientId = 'aaaaaaaa-0000-0000-0000-000000000002';
      const prescription = makePrescription({ patientId });
      expect(prescription.patientId).toBe(patientId);
    });

    it('accepts a consultationId when provided', () => {
      const consultationId = 'cccccccc-0000-0000-0000-000000000001';
      const prescription = makePrescription({ consultationId });
      expect(prescription.consultationId).toBe(consultationId);
    });
  });
});
