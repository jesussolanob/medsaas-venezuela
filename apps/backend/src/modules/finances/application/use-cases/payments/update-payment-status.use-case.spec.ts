import { UpdatePaymentStatusUseCase } from './update-payment-status.use-case';
import type { IPaymentRepository } from '../../../domain/repositories/payment.repository';
import { Payment } from '../../../domain/entities/payment.entity';
import { PaymentNotFoundError } from '../../../domain/errors/payment-not-found.error';
import { InvalidPaymentTransitionError } from '../../../domain/errors/invalid-payment-transition.error';

const makePayment = (overrides: Partial<Parameters<typeof Payment.create>[0]> = {}) =>
  Payment.create({
    id: 'pay-001',
    doctorId: 'doc-001',
    patientId: 'pat-001',
    amountUsd: 30,
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

describe('UpdatePaymentStatusUseCase', () => {
  let useCase: UpdatePaymentStatusUseCase;
  let mockRepo: jest.Mocked<IPaymentRepository>;

  beforeEach(() => {
    mockRepo = {
      listForDoctor: jest.fn(),
      totalsForDoctor: jest.fn(),
      findByIdForDoctor: jest.fn(),
      updateStatus: jest.fn(),
      addItem: jest.fn(),
      removeItem: jest.fn(),
      listItems: jest.fn(),
      create: jest.fn(),
      attachReceiptUrl: jest.fn(),
    };
    useCase = new UpdatePaymentStatusUseCase(mockRepo);
  });

  it('approves a pending payment', async () => {
    const pending = makePayment();
    const approved = pending.approve();
    mockRepo.findByIdForDoctor.mockResolvedValue(pending);
    mockRepo.updateStatus.mockResolvedValue(approved);

    const result = await useCase.execute({
      paymentId: 'pay-001',
      doctorId: 'doc-001',
      status: 'approved',
    });

    expect(result.status).toBe('approved');
    expect(mockRepo.updateStatus).toHaveBeenCalledWith('pay-001', 'doc-001', 'approved');
  });

  it('marks an approved payment as pending', async () => {
    const approved = makePayment({ status: 'approved', paidAt: new Date() });
    const pending = approved.markPending();
    mockRepo.findByIdForDoctor.mockResolvedValue(approved);
    mockRepo.updateStatus.mockResolvedValue(pending);

    const result = await useCase.execute({
      paymentId: 'pay-001',
      doctorId: 'doc-001',
      status: 'pending',
    });

    expect(result.status).toBe('pending');
  });

  it('throws PaymentNotFoundError when payment does not exist', async () => {
    mockRepo.findByIdForDoctor.mockResolvedValue(null);

    await expect(
      useCase.execute({ paymentId: 'pay-999', doctorId: 'doc-001', status: 'approved' }),
    ).rejects.toThrow(PaymentNotFoundError);

    expect(mockRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('does not call updateStatus when payment is not found (anti-IDOR fast-fail)', async () => {
    mockRepo.findByIdForDoctor.mockResolvedValue(null);

    await expect(
      useCase.execute({ paymentId: 'pay-other', doctorId: 'doc-001', status: 'approved' }),
    ).rejects.toThrow(PaymentNotFoundError);

    expect(mockRepo.updateStatus).not.toHaveBeenCalled();
  });

  it('propagates InvalidPaymentTransitionError from the domain layer', async () => {
    const approved = makePayment({ status: 'approved', paidAt: new Date() });
    mockRepo.findByIdForDoctor.mockResolvedValue(approved);
    mockRepo.updateStatus.mockRejectedValue(
      new InvalidPaymentTransitionError('pay-001', 'approved', 'approved'),
    );

    await expect(
      useCase.execute({ paymentId: 'pay-001', doctorId: 'doc-001', status: 'approved' }),
    ).rejects.toThrow(InvalidPaymentTransitionError);
  });
});
