import { Consultation } from './consultation.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PATIENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

function makeConsultation(
  overrides: Partial<ConstructorParameters<typeof Consultation>[0]> = {},
): Consultation {
  return Consultation.create({
    id: 'cccccccc-0000-0000-0000-000000000001',
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    consultationCode: 'DLT-202606-0001',
    consultationDate: now,
    paymentStatus: 'pending',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('Consultation', () => {
  describe('canBeModifiedBy', () => {
    it('returns true when doctorId matches', () => {
      const consultation = makeConsultation();
      expect(consultation.canBeModifiedBy(DOCTOR_ID)).toBe(true);
    });

    it('returns false when doctorId does not match', () => {
      const consultation = makeConsultation();
      const otherDoctor = 'eeeeeeee-0000-0000-0000-000000000002';
      expect(consultation.canBeModifiedBy(otherDoctor)).toBe(false);
    });
  });

  describe('canApprovePayment', () => {
    it('returns true when paymentStatus is pending', () => {
      const consultation = makeConsultation({ paymentStatus: 'pending' });
      expect(consultation.canApprovePayment()).toBe(true);
    });

    it('returns false when paymentStatus is approved', () => {
      const consultation = makeConsultation({ paymentStatus: 'approved' });
      expect(consultation.canApprovePayment()).toBe(false);
    });
  });

  describe('constructor defaults', () => {
    it('defaults optional fields to null', () => {
      const consultation = makeConsultation();
      expect(consultation.appointmentId).toBeNull();
      expect(consultation.chiefComplaint).toBeNull();
      expect(consultation.diagnosis).toBeNull();
      expect(consultation.treatment).toBeNull();
      expect(consultation.notes).toBeNull();
      expect(consultation.paymentMethod).toBeNull();
      expect(consultation.amount).toBeNull();
      expect(consultation.paymentDate).toBeNull();
      expect(consultation.paymentReference).toBeNull();
      expect(consultation.paymentReceiptUrl).toBeNull();
      expect(consultation.blocksSnapshot).toBeNull();
    });

    it('preserves provided optional fields', () => {
      const consultation = makeConsultation({
        chiefComplaint: 'Headache',
        diagnosis: 'Migraine',
        treatment: 'Rest and hydration',
        notes: 'Follow-up in 2 weeks',
        amount: 50.0,
        paymentMethod: 'zelle',
      });
      expect(consultation.chiefComplaint).toBe('Headache');
      expect(consultation.diagnosis).toBe('Migraine');
      expect(consultation.treatment).toBe('Rest and hydration');
      expect(consultation.notes).toBe('Follow-up in 2 weeks');
      expect(consultation.amount).toBe(50.0);
      expect(consultation.paymentMethod).toBe('zelle');
    });

    it('preserves paymentReference and paymentReceiptUrl when provided', () => {
      const consultation = makeConsultation({
        paymentReference: 'TXN-0099',
        paymentReceiptUrl: 'https://example.com/receipt.pdf',
      });
      expect(consultation.paymentReference).toBe('TXN-0099');
      expect(consultation.paymentReceiptUrl).toBe('https://example.com/receipt.pdf');
    });
  });

  describe('static create', () => {
    it('returns a Consultation instance', () => {
      const consultation = makeConsultation();
      expect(consultation).toBeInstanceOf(Consultation);
    });
  });
});
