import { RejectSubscriptionPaymentUseCase } from './reject-subscription-payment.use-case';
import { SubscriptionPayment } from '../../../domain/entities/subscription-payment.entity';
import { SubscriptionPaymentNotFoundError } from '../../../domain/errors/subscription-payment-not-found.error';
import { SubscriptionPaymentAlreadyResolvedError } from '../../../domain/errors/subscription-payment-already-resolved.error';
import type { ISubscriptionPaymentRepository } from '../../../domain/repositories/subscription-payment.repository';

function makePendingPayment(): SubscriptionPayment {
  return SubscriptionPayment.create({
    id: 'pay-1',
    doctorId: 'doc-1',
    amountUsd: 50,
    method: 'Zelle',
    referenceNumber: null,
    durationMonths: 1,
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('RejectSubscriptionPaymentUseCase', () => {
  let mockRepo: jest.Mocked<ISubscriptionPaymentRepository>;
  let useCase: RejectSubscriptionPaymentUseCase;

  beforeEach(() => {
    mockRepo = {
      list: jest.fn(),
      findById: jest.fn(),
      save: jest.fn(),
      approveAndExtend: jest.fn(),
      reject: jest.fn().mockResolvedValue(undefined),
      getFinanceStats: jest.fn(),
    };
    useCase = new RejectSubscriptionPaymentUseCase(mockRepo);
  });

  it('throws SubscriptionPaymentNotFoundError when payment does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute({ paymentId: 'missing', reviewerId: 'admin-1' })).rejects.toThrow(
      SubscriptionPaymentNotFoundError,
    );
  });

  it('throws SubscriptionPaymentAlreadyResolvedError for already rejected payment', async () => {
    const rejected = SubscriptionPayment.create({
      id: 'pay-1',
      doctorId: 'doc-1',
      amountUsd: 50,
      method: 'Zelle',
      referenceNumber: null,
      durationMonths: 1,
      status: 'rejected',
      reviewedBy: 'admin-0',
      reviewedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockRepo.findById.mockResolvedValue(rejected);

    await expect(useCase.execute({ paymentId: 'pay-1', reviewerId: 'admin-1' })).rejects.toThrow(
      SubscriptionPaymentAlreadyResolvedError,
    );
  });

  it('calls repo.reject with correct args for a pending payment', async () => {
    const payment = makePendingPayment();
    mockRepo.findById.mockResolvedValue(payment);

    await useCase.execute({
      paymentId: 'pay-1',
      reviewerId: 'admin-1',
      reason: 'Reference not found',
    });

    expect(mockRepo.reject).toHaveBeenCalledWith('pay-1', 'admin-1', 'Reference not found');
  });

  it('calls repo.reject without reason when none is provided', async () => {
    const payment = makePendingPayment();
    mockRepo.findById.mockResolvedValue(payment);

    await useCase.execute({ paymentId: 'pay-1', reviewerId: 'admin-1' });

    expect(mockRepo.reject).toHaveBeenCalledWith('pay-1', 'admin-1', undefined);
  });

  it('does not call repo.reject on domain validation failure', async () => {
    const approved = SubscriptionPayment.create({
      id: 'pay-1',
      doctorId: 'doc-1',
      amountUsd: 50,
      method: 'Zelle',
      referenceNumber: null,
      durationMonths: 1,
      status: 'approved',
      reviewedBy: 'admin-0',
      reviewedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockRepo.findById.mockResolvedValue(approved);

    await expect(useCase.execute({ paymentId: 'pay-1', reviewerId: 'admin-1' })).rejects.toThrow();
    expect(mockRepo.reject).not.toHaveBeenCalled();
  });
});
