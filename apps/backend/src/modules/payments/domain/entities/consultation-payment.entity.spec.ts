import {
  ConsultationPayment,
  type ConsultationPaymentCreateParams,
} from './consultation-payment.entity';
import { PaymentAlreadyResolvedError } from '../errors/payment-already-resolved.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OTHER_DOCTOR_ID = 'eeeeeeee-0000-0000-0000-000000000002';
const PAYMENT_ID = 'pppppppp-0000-0000-0000-000000000001';
const CONSULTATION_ID = 'cccccccc-0000-0000-0000-000000000001';
const PATIENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const now = new Date('2026-06-03T10:00:00Z');

function makePayment(
  overrides: Partial<ConsultationPaymentCreateParams> = {},
): ConsultationPayment {
  return ConsultationPayment.create({
    id: PAYMENT_ID,
    consultationId: CONSULTATION_ID,
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    amount: 100,
    currency: 'USD',
    paymentMethod: 'zelle',
    referenceNumber: null,
    receiptUrl: null,
    notes: null,
    status: 'pending',
    approvedAt: null,
    approvedBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('ConsultationPayment entity', () => {
  describe('isOwnedBy', () => {
    it('returns true when doctorId matches', () => {
      const payment = makePayment();
      expect(payment.isOwnedBy(DOCTOR_ID)).toBe(true);
    });

    it('returns false when doctorId does not match', () => {
      const payment = makePayment();
      expect(payment.isOwnedBy(OTHER_DOCTOR_ID)).toBe(false);
    });
  });

  describe('isPending', () => {
    it('returns true for pending status', () => {
      const payment = makePayment({ status: 'pending' });
      expect(payment.isPending()).toBe(true);
    });

    it('returns false for approved status', () => {
      const payment = makePayment({ status: 'approved' });
      expect(payment.isPending()).toBe(false);
    });

    it('returns false for rejected status', () => {
      const payment = makePayment({ status: 'rejected' });
      expect(payment.isPending()).toBe(false);
    });
  });

  describe('approve', () => {
    it('transitions pending to approved and returns a new instance', () => {
      const payment = makePayment({ status: 'pending' });
      const approved = payment.approve(DOCTOR_ID);

      expect(approved.status).toBe('approved');
      expect(approved.approvedBy).toBe(DOCTOR_ID);
      expect(approved.approvedAt).toBeInstanceOf(Date);
    });

    it('does not mutate the original entity', () => {
      const payment = makePayment({ status: 'pending' });
      payment.approve(DOCTOR_ID);

      expect(payment.status).toBe('pending');
    });

    it('throws PaymentAlreadyResolvedError when already approved', () => {
      const payment = makePayment({ status: 'approved' });
      expect(() => payment.approve(DOCTOR_ID)).toThrow(PaymentAlreadyResolvedError);
    });

    it('throws PaymentAlreadyResolvedError when already rejected', () => {
      const payment = makePayment({ status: 'rejected' });
      expect(() => payment.approve(DOCTOR_ID)).toThrow(PaymentAlreadyResolvedError);
    });

    it('preserves existing fields on the new instance', () => {
      const payment = makePayment({ status: 'pending', amount: 250, currency: 'USD' });
      const approved = payment.approve(DOCTOR_ID);

      expect(approved.id).toBe(PAYMENT_ID);
      expect(approved.consultationId).toBe(CONSULTATION_ID);
      expect(approved.amount).toBe(250);
      expect(approved.currency).toBe('USD');
    });
  });

  describe('reject', () => {
    it('transitions pending to rejected and returns a new instance', () => {
      const payment = makePayment({ status: 'pending' });
      const rejected = payment.reject();

      expect(rejected.status).toBe('rejected');
    });

    it('does not mutate the original entity', () => {
      const payment = makePayment({ status: 'pending' });
      payment.reject();

      expect(payment.status).toBe('pending');
    });

    it('throws PaymentAlreadyResolvedError when already approved', () => {
      const payment = makePayment({ status: 'approved' });
      expect(() => payment.reject()).toThrow(PaymentAlreadyResolvedError);
    });

    it('throws PaymentAlreadyResolvedError when already rejected', () => {
      const payment = makePayment({ status: 'rejected' });
      expect(() => payment.reject()).toThrow(PaymentAlreadyResolvedError);
    });

    it('preserves existing fields on the new instance', () => {
      const payment = makePayment({ status: 'pending', paymentMethod: 'pago_movil' });
      const rejected = payment.reject();

      expect(rejected.paymentMethod).toBe('pago_movil');
      expect(rejected.doctorId).toBe(DOCTOR_ID);
    });
  });

  describe('static create factory', () => {
    it('constructs a payment with all provided params', () => {
      const params: ConsultationPaymentCreateParams = {
        id: PAYMENT_ID,
        consultationId: CONSULTATION_ID,
        doctorId: DOCTOR_ID,
        patientId: PATIENT_ID,
        amount: 75.5,
        currency: 'USD',
        paymentMethod: 'transferencia',
        referenceNumber: 'REF-001',
        receiptUrl: 'https://example.com/receipt.pdf',
        notes: 'Pago recibido',
        status: 'pending',
        approvedAt: null,
        approvedBy: null,
        createdAt: now,
        updatedAt: now,
      };

      const payment = ConsultationPayment.create(params);

      expect(payment.id).toBe(PAYMENT_ID);
      expect(payment.amount).toBe(75.5);
      expect(payment.referenceNumber).toBe('REF-001');
      expect(payment.receiptUrl).toBe('https://example.com/receipt.pdf');
      expect(payment.notes).toBe('Pago recibido');
    });
  });
});
