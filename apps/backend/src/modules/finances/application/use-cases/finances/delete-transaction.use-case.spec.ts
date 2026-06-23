import { DeleteTransactionUseCase } from './delete-transaction.use-case';
import { TransactionNotFoundError } from '../../../domain/errors/transaction-not-found.error';
import { ForbiddenDomainError } from '../../../domain/errors/forbidden-domain.error';
import type { IFinanceRepository } from '../../../domain/repositories/finance.repository';

const DOCTOR_ID = 'd0c70000-0000-0000-0000-000000000001';
const TX_ID = 'aaaabbbb-cccc-dddd-eeee-ffffaaaabbbb';

describe('DeleteTransactionUseCase', () => {
  let useCase: DeleteTransactionUseCase;
  let mockRepo: jest.Mocked<IFinanceRepository>;

  beforeEach(() => {
    mockRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      list: jest.fn(),
      getConsultationSummary: jest.fn(),
      sumManualIncome: jest.fn(),
      sumExpenses: jest.fn(),
      delete: jest.fn(),
      lifetimeIncome: jest.fn(),
      updateTransaction: jest.fn(),
      listIncomeTransactions: jest.fn(),
    };
    useCase = new DeleteTransactionUseCase(mockRepo);
  });

  it('calls repo.delete with the correct args', async () => {
    mockRepo.delete.mockResolvedValue(undefined);

    await useCase.execute({ transactionId: TX_ID, doctorId: DOCTOR_ID });

    expect(mockRepo.delete).toHaveBeenCalledWith(TX_ID, DOCTOR_ID);
  });

  it('propagates TransactionNotFoundError from repo', async () => {
    mockRepo.delete.mockRejectedValue(new TransactionNotFoundError());

    await expect(
      useCase.execute({ transactionId: TX_ID, doctorId: DOCTOR_ID }),
    ).rejects.toBeInstanceOf(TransactionNotFoundError);
  });

  it('propagates ForbiddenDomainError when repo enforces ownership', async () => {
    mockRepo.delete.mockRejectedValue(
      new ForbiddenDomainError('Transaction does not belong to this doctor'),
    );

    await expect(
      useCase.execute({ transactionId: TX_ID, doctorId: DOCTOR_ID }),
    ).rejects.toBeInstanceOf(ForbiddenDomainError);
  });
});
