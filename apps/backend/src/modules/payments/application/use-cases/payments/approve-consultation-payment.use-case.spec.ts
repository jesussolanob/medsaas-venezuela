import { ApproveConsultationPaymentUseCase } from './approve-consultation-payment.use-case';
import type { IConsultationPaymentRepository } from '../../../domain/repositories/consultation-payment.repository';
import { ConsultationPayment } from '../../../domain/entities/consultation-payment.entity';
import { ConsultationPaymentNotFoundError } from '../../../domain/errors/consultation-payment-not-found.error';
import { ConsultationPaymentNotOwnedError } from '../../../domain/errors/consultation-payment-not-owned.error';
import { PaymentAlreadyResolvedError } from '../../../domain/errors/payment-already-resolved.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OTHER_DOCTOR_ID = 'eeeeeeee-0000-0000-0000-000000000002';
const PAYMENT_ID = 'pppppppp-0000-0000-0000-000000000001';
const CONSULTATION_ID = 'cccccccc-0000-0000-0000-000000000001';
const PATIENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const now = new Date('2026-06-03T10:00:00Z');

function makePayment(
  overrides: Partial<ConstructorParameters<typeof ConsultationPayment>[0]> = {},
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

describe('ApproveConsultationPaymentUseCase', () => {
  let useCase: ApproveConsultationPaymentUseCase;
  let mockRepo: jest.Mocked<IConsultationPaymentRepository>;

  beforeEach(() => {
    mockRepo = {
      list: jest.fn(),
      findByIdForDoctor: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    useCase = new ApproveConsultationPaymentUseCase(mockRepo);
  });

  it('transitions pending → approved and persists', async () => {
    const pending = makePayment({ status: 'pending' });
    const approved = makePayment({
      status: 'approved',
      approvedBy: DOCTOR_ID,
      approvedAt: new Date(),
    });
    mockRepo.findByIdForDoctor.mockResolvedValue(pending);
    mockRepo.save.mockResolvedValue(approved);

    const result = await useCase.execute({ paymentId: PAYMENT_ID, doctorId: DOCTOR_ID });

    expect(result.status).toBe('approved');
    expect(result.approvedBy).toBe(DOCTOR_ID);
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
  });

  it('throws ConsultationPaymentNotFoundError when payment does not exist', async () => {
    mockRepo.findByIdForDoctor.mockResolvedValue(null);

    await expect(useCase.execute({ paymentId: PAYMENT_ID, doctorId: DOCTOR_ID })).rejects.toThrow(
      ConsultationPaymentNotFoundError,
    );

    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('throws ConsultationPaymentNotOwnedError when doctor does not own payment', async () => {
    const payment = makePayment({ doctorId: DOCTOR_ID });
    mockRepo.findByIdForDoctor.mockResolvedValue(payment);

    await expect(
      useCase.execute({ paymentId: PAYMENT_ID, doctorId: OTHER_DOCTOR_ID }),
    ).rejects.toThrow(ConsultationPaymentNotOwnedError);

    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('throws PaymentAlreadyResolvedError when payment is already approved', async () => {
    const payment = makePayment({ status: 'approved' });
    mockRepo.findByIdForDoctor.mockResolvedValue(payment);

    await expect(useCase.execute({ paymentId: PAYMENT_ID, doctorId: DOCTOR_ID })).rejects.toThrow(
      PaymentAlreadyResolvedError,
    );

    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('throws PaymentAlreadyResolvedError when payment is already rejected', async () => {
    const payment = makePayment({ status: 'rejected' });
    mockRepo.findByIdForDoctor.mockResolvedValue(payment);

    await expect(useCase.execute({ paymentId: PAYMENT_ID, doctorId: DOCTOR_ID })).rejects.toThrow(
      PaymentAlreadyResolvedError,
    );

    expect(mockRepo.save).not.toHaveBeenCalled();
  });
});
