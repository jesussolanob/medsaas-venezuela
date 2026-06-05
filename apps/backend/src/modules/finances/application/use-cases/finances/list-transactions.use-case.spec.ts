import { ListTransactionsUseCase } from './list-transactions.use-case';
import type { IFinanceRepository } from '../../../domain/repositories/finance.repository';
import { FinancialTransaction } from '../../../domain/entities/financial-transaction.entity';
import { Money } from '../../../domain/value-objects/money.vo';

describe('ListTransactionsUseCase', () => {
  let useCase: ListTransactionsUseCase;
  let mockRepo: jest.Mocked<IFinanceRepository>;

  const makeTx = (type: 'income' | 'expense' = 'income') =>
    FinancialTransaction.create({
      id: 'tx-id-1',
      doctorId: 'doc-id-1',
      type,
      amount: new Money(100, 'USD'),
      description: 'Test',
      relatedConsultationId: null,
      date: new Date('2026-06-01T10:00:00Z'),
      createdAt: new Date('2026-06-01T10:00:00Z'),
    });

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
    };
    useCase = new ListTransactionsUseCase(mockRepo);
  });

  it('returns mapped transaction items from repo', async () => {
    mockRepo.list.mockResolvedValue({
      items: [makeTx('income'), makeTx('expense')],
      total: 2,
      page: 1,
      limit: 20,
    });

    const result = await useCase.execute({ doctorId: 'doc-id-1', page: 1, limit: 20 });

    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.type).toBe('income');
    expect(result.items[1]?.type).toBe('expense');
  });

  it('passes month filter to repository', async () => {
    mockRepo.list.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

    await useCase.execute({ doctorId: 'doc-id-1', month: '2026-06', page: 1, limit: 20 });

    expect(mockRepo.list).toHaveBeenCalledWith(expect.objectContaining({ month: '2026-06' }));
  });

  it('maps Money amount and currency to output DTO', async () => {
    mockRepo.list.mockResolvedValue({
      items: [makeTx('income')],
      total: 1,
      page: 1,
      limit: 20,
    });

    const result = await useCase.execute({ doctorId: 'doc-id-1', page: 1, limit: 20 });

    expect(result.items[0]?.amount).toBe(100);
    expect(result.items[0]?.currency).toBe('USD');
  });

  it('returns correct pagination metadata', async () => {
    mockRepo.list.mockResolvedValue({ items: [], total: 50, page: 3, limit: 10 });

    const result = await useCase.execute({ doctorId: 'doc-id-1', page: 3, limit: 10 });

    expect(result.page).toBe(3);
    expect(result.limit).toBe(10);
    expect(result.total).toBe(50);
  });

  it('returns empty list for months with no transactions', async () => {
    mockRepo.list.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

    const result = await useCase.execute({
      doctorId: 'doc-id-1',
      month: '2020-01',
      page: 1,
      limit: 20,
    });

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});
