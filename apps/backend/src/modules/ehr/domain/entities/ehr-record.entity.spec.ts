import { EhrRecord } from './ehr-record.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OTHER_DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000002';
const now = new Date('2026-06-01T00:00:00Z');

function makeEhrRecord(
  overrides: Partial<ConstructorParameters<typeof EhrRecord>[0]> = {},
): EhrRecord {
  return EhrRecord.create({
    id: 'eeeeeeee-0000-0000-0000-000000000001',
    patientId: 'pppppppp-0000-0000-0000-000000000001',
    doctorId: DOCTOR_ID,
    consultationId: null,
    diagnosis: 'Hypertension',
    treatmentPlan: 'Lifestyle changes',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('EhrRecord', () => {
  describe('canBeModifiedBy', () => {
    it('returns true for the owner doctor', () => {
      const record = makeEhrRecord();
      expect(record.canBeModifiedBy(DOCTOR_ID)).toBe(true);
    });

    it('returns false for a different doctor', () => {
      const record = makeEhrRecord();
      expect(record.canBeModifiedBy(OTHER_DOCTOR_ID)).toBe(false);
    });

    it('returns false for an empty string', () => {
      const record = makeEhrRecord();
      expect(record.canBeModifiedBy('')).toBe(false);
    });
  });

  describe('create', () => {
    it('initializes all fields from params', () => {
      const record = makeEhrRecord();
      expect(record.id).toBe('eeeeeeee-0000-0000-0000-000000000001');
      expect(record.patientId).toBe('pppppppp-0000-0000-0000-000000000001');
      expect(record.doctorId).toBe(DOCTOR_ID);
      expect(record.diagnosis).toBe('Hypertension');
      expect(record.treatmentPlan).toBe('Lifestyle changes');
      expect(record.consultationId).toBeNull();
    });

    it('defaults consultationId to null when not provided', () => {
      const record = EhrRecord.create({
        id: 'eeeeeeee-0000-0000-0000-000000000002',
        patientId: 'pppppppp-0000-0000-0000-000000000001',
        doctorId: DOCTOR_ID,
        createdAt: now,
        updatedAt: now,
      });
      expect(record.consultationId).toBeNull();
      expect(record.diagnosis).toBeNull();
      expect(record.treatmentPlan).toBeNull();
    });

    it('accepts a consultationId when provided', () => {
      const consultationId = 'cccccccc-0000-0000-0000-000000000001';
      const record = makeEhrRecord({ consultationId });
      expect(record.consultationId).toBe(consultationId);
    });
  });
});
