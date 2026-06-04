import { ListConsultationPaymentsUseCase } from './list-consultation-payments.use-case';
import type { IConsultationPaymentRepository } from '../../../domain/repositories/consultation-payment.repository';
import { ConsultationPayment } from '../../../domain/entities/consultation-payment.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PAYMENT_ID = 'pppppppp-0000-0000-0000-000000000001';
const CONSULTATION_ID = 'cccccccc-0000-0000-0000-000000000001';
const PATIENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const now = new Date('2026-06-03T10:00:00Z');

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

describe('ListConsultationPaymentsUseCase', () => {
  let useCase: ListConsultationPaymentsUseCase;
  let mockRepo: jest.Mocked<IConsultationPaymentRepository>;

  beforeEach(() => {
    mockRepo = {
      list: jest.fn(),
      findByIdForDoctor: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    useCase = new ListConsultationPaymentsUseCase(mockRepo);
  });

  it('returns paginated payments for the doctor', async () => {
    const payment = makePayment();
    mockRepo.list.mockResolvedValue({ items: [payment], total: 1 });

    const result = await useCase.execute({ doctorId: DOCTOR_ID, limit: 20, offset: 0 });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(mockRepo.list).toHaveBeenCalledWith(
      expect.objectContaining({ doctorId: DOCTOR_ID, limit: 20, offset: 0 }),
    );
  });

  it('passes consultationId filter to the repository', async () => {
    mockRepo.list.mockResolvedValue({ items: [], total: 0 });

    await useCase.execute({
      doctorId: DOCTOR_ID,
      consultationId: CONSULTATION_ID,
      limit: 20,
      offset: 0,
    });

    expect(mockRepo.list).toHaveBeenCalledWith(
      expect.objectContaining({ consultationId: CONSULTATION_ID }),
    );
  });

  it('passes status filter to the repository', async () => {
    mockRepo.list.mockResolvedValue({ items: [], total: 0 });

    await useCase.execute({ doctorId: DOCTOR_ID, status: 'approved', limit: 20, offset: 0 });

    expect(mockRepo.list).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }));
  });

  it('returns empty result when no payments exist', async () => {
    mockRepo.list.mockResolvedValue({ items: [], total: 0 });

    const result = await useCase.execute({ doctorId: DOCTOR_ID, limit: 20, offset: 0 });

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});
