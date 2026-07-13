import { RegisterConsultationPaymentUseCase } from './register-consultation-payment.use-case';
import type { IConsultationPaymentRepository } from '../../../domain/repositories/consultation-payment.repository';
import type { IConsultationRepository } from '../../../../consultations/domain/repositories/consultation.repository';
import { ConsultationPayment } from '../../../domain/entities/consultation-payment.entity';
import { ConsultationPaymentNotFoundError } from '../../../domain/errors/consultation-payment-not-found.error';
import { Consultation } from '../../../../consultations/domain/entities/consultation.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PATIENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const CONSULTATION_ID = 'cccccccc-0000-0000-0000-000000000001';
const PAYMENT_ID = 'pppppppp-0000-0000-0000-000000000001';
const now = new Date('2026-06-03T10:00:00Z');

function makeConsultation(): Consultation {
  return Consultation.create({
    id: CONSULTATION_ID,
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    consultationCode: 'DLT-202606-0001',
    consultationDate: now,
    paymentStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  });
}

function makePayment(): ConsultationPayment {
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
  });
}

describe('RegisterConsultationPaymentUseCase', () => {
  let useCase: RegisterConsultationPaymentUseCase;
  let mockPaymentRepo: jest.Mocked<IConsultationPaymentRepository>;
  let mockConsultationRepo: jest.Mocked<IConsultationRepository>;

  beforeEach(() => {
    mockPaymentRepo = {
      list: jest.fn(),
      findByIdForDoctor: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    mockConsultationRepo = {
      findById: jest.fn(),
      findByCode: jest.fn(),
      countByDoctorAndMonth: jest.fn(),
      getMaxSequenceForMonth: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      updatePayment: jest.fn(),
      updatePaymentDetails: jest.fn(),
      approveWithExtras: jest.fn(),
      findExtraItems: jest.fn(),
      list: jest.fn(),
      findByPatient: jest.fn(),
      findByAppointmentId: jest.fn(),
      deleteById: jest.fn().mockResolvedValue(undefined),
      listWithAppointment: jest.fn(),
    };
    useCase = new RegisterConsultationPaymentUseCase(mockPaymentRepo, mockConsultationRepo);
  });

  it('registers a payment successfully when consultation belongs to doctor', async () => {
    const consultation = makeConsultation();
    const payment = makePayment();
    mockConsultationRepo.findById.mockResolvedValue(consultation);
    mockPaymentRepo.create.mockResolvedValue(payment);

    const result = await useCase.execute({
      doctorId: DOCTOR_ID,
      consultationId: CONSULTATION_ID,
      patientId: PATIENT_ID,
      amount: 100,
      currency: 'USD',
      paymentMethod: 'zelle',
    });

    expect(result.status).toBe('pending');
    expect(result.amount).toBe(100);
    expect(result.doctorId).toBe(DOCTOR_ID);
  });

  it('verifies consultation ownership before creating payment', async () => {
    const consultation = makeConsultation();
    const payment = makePayment();
    mockConsultationRepo.findById.mockResolvedValue(consultation);
    mockPaymentRepo.create.mockResolvedValue(payment);

    await useCase.execute({
      doctorId: DOCTOR_ID,
      consultationId: CONSULTATION_ID,
      patientId: PATIENT_ID,
      amount: 100,
      currency: 'USD',
      paymentMethod: 'zelle',
    });

    expect(mockConsultationRepo.findById).toHaveBeenCalledWith(CONSULTATION_ID, DOCTOR_ID);
  });

  it('throws ConsultationPaymentNotFoundError when consultation does not exist for doctor', async () => {
    mockConsultationRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        doctorId: DOCTOR_ID,
        consultationId: CONSULTATION_ID,
        patientId: PATIENT_ID,
        amount: 100,
        currency: 'USD',
        paymentMethod: 'zelle',
      }),
    ).rejects.toThrow(ConsultationPaymentNotFoundError);

    expect(mockPaymentRepo.create).not.toHaveBeenCalled();
  });

  it('passes optional fields to the payment entity', async () => {
    const consultation = makeConsultation();
    mockConsultationRepo.findById.mockResolvedValue(consultation);

    const capturedPayment = makePayment();
    mockPaymentRepo.create.mockImplementation(async (p) => {
      return p; // echo back
    });

    const result = await useCase.execute({
      doctorId: DOCTOR_ID,
      consultationId: CONSULTATION_ID,
      patientId: PATIENT_ID,
      amount: 150,
      currency: 'USD',
      paymentMethod: 'pago_movil',
      referenceNumber: 'REF-123',
      receiptUrl: 'https://example.com/receipt.pdf',
      notes: 'Nota de prueba',
    });

    expect(result.referenceNumber).toBe('REF-123');
    expect(result.receiptUrl).toBe('https://example.com/receipt.pdf');
    expect(result.notes).toBe('Nota de prueba');
    expect(result.status).toBe('pending');

    // Suppress unused variable warning
    void capturedPayment;
  });

  it('always creates payment with status pending', async () => {
    const consultation = makeConsultation();
    mockConsultationRepo.findById.mockResolvedValue(consultation);
    mockPaymentRepo.create.mockImplementation(async (p) => p);

    const result = await useCase.execute({
      doctorId: DOCTOR_ID,
      consultationId: CONSULTATION_ID,
      patientId: PATIENT_ID,
      amount: 50,
      currency: 'USD',
      paymentMethod: 'efectivo',
    });

    expect(result.status).toBe('pending');
    expect(result.approvedAt).toBeNull();
    expect(result.approvedBy).toBeNull();
  });
});
