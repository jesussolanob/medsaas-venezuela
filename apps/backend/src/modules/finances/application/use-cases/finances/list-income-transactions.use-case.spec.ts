import { ListIncomeTransactionsUseCase } from './list-income-transactions.use-case';
import type {
  IFinanceRepository,
  IncomeTransactionItem,
} from '../../../domain/repositories/finance.repository';

const makeItem = (overrides: Partial<IncomeTransactionItem> = {}): IncomeTransactionItem => ({
  id: 'tx-1',
  amount: 100,
  currency: 'USD',
  description: 'Consulta',
  date: new Date('2026-06-01T10:00:00Z'),
  conceptId: null,
  patientId: null,
  patientName: null,
  ...overrides,
});

describe('ListIncomeTransactionsUseCase', () => {
  let useCase: ListIncomeTransactionsUseCase;
  let mockRepo: jest.Mocked<Pick<IFinanceRepository, 'listIncomeTransactions'>>;

  beforeEach(() => {
    mockRepo = {
      listIncomeTransactions: jest.fn(),
    };
    useCase = new ListIncomeTransactionsUseCase(mockRepo as unknown as IFinanceRepository);
  });

  it('delegates to repository and returns items', async () => {
    const items = [
      makeItem(),
      makeItem({ id: 'tx-2', amount: 200, patientId: 'p-1', patientName: 'Ana Lopez' }),
    ];
    mockRepo.listIncomeTransactions.mockResolvedValue(items);

    const result = await useCase.execute({ doctorId: 'doc-1' });

    expect(mockRepo.listIncomeTransactions).toHaveBeenCalledWith({
      doctorId: 'doc-1',
      month: undefined,
      limit: 200,
    });
    expect(result).toHaveLength(2);
    expect(result[1]?.patientName).toBe('Ana Lopez');
  });

  it('passes month filter when provided', async () => {
    mockRepo.listIncomeTransactions.mockResolvedValue([]);

    await useCase.execute({ doctorId: 'doc-1', month: '2026-06' });

    expect(mockRepo.listIncomeTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ month: '2026-06' }),
    );
  });

  it('uses provided limit when within ceiling', async () => {
    mockRepo.listIncomeTransactions.mockResolvedValue([]);

    await useCase.execute({ doctorId: 'doc-1', limit: 50 });

    expect(mockRepo.listIncomeTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50 }),
    );
  });

  it('clamps limit to INCOME_TX_MAX_LIMIT (200) when caller exceeds ceiling', async () => {
    mockRepo.listIncomeTransactions.mockResolvedValue([]);

    await useCase.execute({ doctorId: 'doc-1', limit: 999 });

    expect(mockRepo.listIncomeTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 200 }),
    );
  });

  it('defaults limit to 200 when not specified', async () => {
    mockRepo.listIncomeTransactions.mockResolvedValue([]);

    await useCase.execute({ doctorId: 'doc-1' });

    expect(mockRepo.listIncomeTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 200 }),
    );
  });

  it('returns empty array when no income transactions exist', async () => {
    mockRepo.listIncomeTransactions.mockResolvedValue([]);

    const result = await useCase.execute({ doctorId: 'doc-1', month: '2026-01' });

    expect(result).toEqual([]);
  });

  it('returns income with patientId null for generic income (no patient link)', async () => {
    const items = [makeItem({ patientId: null, patientName: null })];
    mockRepo.listIncomeTransactions.mockResolvedValue(items);

    const result = await useCase.execute({ doctorId: 'doc-1' });

    expect(result[0]?.patientId).toBeNull();
    expect(result[0]?.patientName).toBeNull();
  });
});
