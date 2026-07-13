import { ListPaymentItemsUseCase } from './list-payment-items.use-case';
import type { IPaymentRepository } from '../../../domain/repositories/payment.repository';
import { PaymentItem } from '../../../domain/entities/payment-item.entity';
import { PaymentNotFoundError } from '../../../domain/errors/payment-not-found.error';
import { PaymentNotOwnedError } from '../../../domain/errors/payment-not-owned.error';

const makeItem = (overrides: Partial<Parameters<typeof PaymentItem.create>[0]> = {}) =>
  PaymentItem.create({
    id: 'item-001',
    paymentId: 'pay-001',
    doctorId: 'doc-001',
    name: 'Consulta General',
    amountUsd: 30,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

describe('ListPaymentItemsUseCase', () => {
  let useCase: ListPaymentItemsUseCase;
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
      updateDetails: jest.fn(),
    };
    useCase = new ListPaymentItemsUseCase(mockRepo);
  });

  it('returns items for a payment', async () => {
    const items = [makeItem(), makeItem({ id: 'item-002', name: 'Servicio extra', amountUsd: 15 })];
    mockRepo.listItems.mockResolvedValue(items);

    const result = await useCase.execute({ paymentId: 'pay-001', doctorId: 'doc-001' });

    expect(result).toHaveLength(2);
    expect(mockRepo.listItems).toHaveBeenCalledWith('pay-001', 'doc-001');
  });

  it('returns an empty array when no items exist', async () => {
    mockRepo.listItems.mockResolvedValue([]);
    const result = await useCase.execute({ paymentId: 'pay-001', doctorId: 'doc-001' });
    expect(result).toEqual([]);
  });

  it('propagates PaymentNotFoundError when payment does not exist', async () => {
    mockRepo.listItems.mockRejectedValue(new PaymentNotFoundError('pay-999'));

    await expect(useCase.execute({ paymentId: 'pay-999', doctorId: 'doc-001' })).rejects.toThrow(
      PaymentNotFoundError,
    );
  });

  it('propagates PaymentNotOwnedError when payment belongs to another doctor', async () => {
    mockRepo.listItems.mockRejectedValue(new PaymentNotOwnedError());

    await expect(useCase.execute({ paymentId: 'pay-001', doctorId: 'doc-other' })).rejects.toThrow(
      PaymentNotOwnedError,
    );
  });
});
