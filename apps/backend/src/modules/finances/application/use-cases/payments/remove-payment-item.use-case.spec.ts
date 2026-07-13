import { RemovePaymentItemUseCase } from './remove-payment-item.use-case';
import type { IPaymentRepository } from '../../../domain/repositories/payment.repository';
import { PaymentItemNotFoundError } from '../../../domain/errors/payment-item-not-found.error';
import { PaymentNotOwnedError } from '../../../domain/errors/payment-not-owned.error';

describe('RemovePaymentItemUseCase', () => {
  let useCase: RemovePaymentItemUseCase;
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
    useCase = new RemovePaymentItemUseCase(mockRepo);
  });

  it('removes an item successfully', async () => {
    mockRepo.removeItem.mockResolvedValue(undefined);

    await useCase.execute({ itemId: 'item-001', doctorId: 'doc-001' });

    expect(mockRepo.removeItem).toHaveBeenCalledWith('item-001', 'doc-001');
  });

  it('propagates PaymentItemNotFoundError from the repository', async () => {
    mockRepo.removeItem.mockRejectedValue(new PaymentItemNotFoundError('item-999'));

    await expect(useCase.execute({ itemId: 'item-999', doctorId: 'doc-001' })).rejects.toThrow(
      PaymentItemNotFoundError,
    );
  });

  it('propagates PaymentNotOwnedError when item belongs to another doctor', async () => {
    mockRepo.removeItem.mockRejectedValue(new PaymentNotOwnedError());

    await expect(useCase.execute({ itemId: 'item-001', doctorId: 'doc-other' })).rejects.toThrow(
      PaymentNotOwnedError,
    );
  });
});
