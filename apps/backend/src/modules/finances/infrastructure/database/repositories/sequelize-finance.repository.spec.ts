import { SequelizeFinanceRepository } from './sequelize-finance.repository';
import { FinancialTransaction } from '../../../domain/entities/financial-transaction.entity';
import { Money } from '../../../domain/value-objects/money.vo';

describe('SequelizeFinanceRepository', () => {
  let repo: SequelizeFinanceRepository;
  let mockTxModel: jest.Mocked<{
    create: jest.Mock;
    findOne: jest.Mock;
    findAndCountAll: jest.Mock;
  }>;
  let mockSequelize: jest.Mocked<{ query: jest.Mock }>;

  const makeTx = (overrides: Partial<Parameters<typeof FinancialTransaction.create>[0]> = {}) =>
    FinancialTransaction.create({
      id: 'tx-id-1',
      doctorId: 'doc-id-1',
      type: 'income',
      amount: new Money(100, 'USD'),
      description: 'Test income',
      relatedConsultationId: null,
      date: new Date('2026-06-15T10:00:00Z'),
      createdAt: new Date('2026-06-15T10:00:00Z'),
      ...overrides,
    });

  const makeRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'tx-id-1',
    doctorId: 'doc-id-1',
    type: 'income',
    amount: '100.00',
    currency: 'USD',
    description: 'Test income',
    relatedConsultationId: null,
    transactionDate: new Date('2026-06-15T10:00:00Z'),
    createdAt: new Date('2026-06-15T10:00:00Z'),
    ...overrides,
  });

  beforeEach(() => {
    mockTxModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      findAndCountAll: jest.fn(),
    } as unknown as jest.Mocked<typeof mockTxModel>;

    mockSequelize = { query: jest.fn() } as unknown as jest.Mocked<typeof mockSequelize>;

    repo = new SequelizeFinanceRepository(
      mockTxModel as unknown as ConstructorParameters<typeof SequelizeFinanceRepository>[0],
      mockSequelize as unknown as ConstructorParameters<typeof SequelizeFinanceRepository>[1],
    );
  });

  describe('save', () => {
    it('persists a transaction and returns domain entity', async () => {
      const row = makeRow();
      mockTxModel.create.mockResolvedValue(row);

      const tx = makeTx();
      const result = await repo.save(tx);

      expect(mockTxModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'tx-id-1',
          type: 'income',
          amount: 100,
          currency: 'USD',
        }),
      );
      expect(result).toBeInstanceOf(FinancialTransaction);
      expect(result.amount.amount).toBe(100);
    });
  });

  describe('findById', () => {
    it('returns domain entity when row exists', async () => {
      mockTxModel.findOne.mockResolvedValue(makeRow());
      const result = await repo.findById('tx-id-1', 'doc-id-1');
      expect(result).toBeInstanceOf(FinancialTransaction);
    });

    it('returns null when row does not exist', async () => {
      mockTxModel.findOne.mockResolvedValue(null);
      const result = await repo.findById('missing', 'doc-id-1');
      expect(result).toBeNull();
    });
  });

  describe('list', () => {
    it('returns paginated result', async () => {
      mockTxModel.findAndCountAll.mockResolvedValue({ count: 1, rows: [makeRow()] });

      const result = await repo.list({ doctorId: 'doc-id-1', page: 1, limit: 20 });

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('applies month filter when provided', async () => {
      mockTxModel.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });

      await repo.list({ doctorId: 'doc-id-1', month: '2026-06', page: 1, limit: 20 });

      expect(mockTxModel.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ transactionDate: expect.anything() }),
        }),
      );
    });
  });

  describe('getConsultationSummary', () => {
    it('returns parsed summary from SQL result', async () => {
      // With QueryTypes.SELECT, sequelize.query returns T[] directly
      mockSequelize.query.mockResolvedValue([
        { approved_total: '500.00', approved_count: '3', pending_total: '200.00' },
      ]);

      const result = await repo.getConsultationSummary('doc-id-1', '2026-06');

      expect(result.approvedTotal).toBe(500);
      expect(result.approvedCount).toBe(3);
      expect(result.pendingTotal).toBe(200);
    });

    it('returns zeros when no rows returned', async () => {
      mockSequelize.query.mockResolvedValue([
        { approved_total: null, approved_count: null, pending_total: null },
      ]);

      const result = await repo.getConsultationSummary('doc-id-1', '2026-06');

      expect(result.approvedTotal).toBe(0);
      expect(result.approvedCount).toBe(0);
      expect(result.pendingTotal).toBe(0);
    });
  });

  describe('sumManualIncome', () => {
    it('sums income transactions for the month', async () => {
      mockSequelize.query.mockResolvedValue([{ total: '300.00', count: '2' }]);

      const result = await repo.sumManualIncome('doc-id-1', '2026-06');

      expect(result.total).toBe(300);
      expect(result.count).toBe(2);
    });
  });

  describe('sumExpenses', () => {
    it('sums expense transactions for the month', async () => {
      mockSequelize.query.mockResolvedValue([{ total: '150.00', count: '1' }]);

      const result = await repo.sumExpenses('doc-id-1', '2026-06');

      expect(result.total).toBe(150);
      expect(result.count).toBe(1);
    });
  });

  describe('monthBounds (via getConsultationSummary)', () => {
    it('throws on malformed month string instead of silently using fallback', async () => {
      // monthBounds is private but exercised through public methods
      await expect(repo.getConsultationSummary('doc-id-1', 'invalid')).rejects.toThrow(
        'Invalid month format: "invalid"',
      );
    });

    it('throws on month with out-of-range monthNum', async () => {
      await expect(repo.getConsultationSummary('doc-id-1', '2026-13')).rejects.toThrow(
        'Invalid month format',
      );
    });

    it('throws on month with zero monthNum', async () => {
      await expect(repo.getConsultationSummary('doc-id-1', '2026-00')).rejects.toThrow(
        'Invalid month format',
      );
    });
  });
});
