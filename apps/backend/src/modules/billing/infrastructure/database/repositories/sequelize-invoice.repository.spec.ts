import { SequelizeInvoiceRepository } from './sequelize-invoice.repository';
import { Invoice } from '../../../domain/entities/invoice.entity';

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'inv-1',
    doctorId: 'doc-1',
    invoiceNumber: 'FAC-20260101-0001',
    amount: '100.00',
    currency: 'USD',
    description: null,
    status: 'issued',
    issuedAt: new Date('2026-01-01'),
    sentAt: null,
    paidAt: null,
    createdBy: 'admin-1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('SequelizeInvoiceRepository', () => {
  let mockModel: {
    count: jest.Mock;
    findAndCountAll: jest.Mock;
    findByPk: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  let repo: SequelizeInvoiceRepository;

  beforeEach(() => {
    mockModel = {
      count: jest.fn(),
      findAndCountAll: jest.fn(),
      findByPk: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };
    repo = new SequelizeInvoiceRepository(
      mockModel as unknown as typeof import('../models/invoice.model').InvoiceModel,
    );
  });

  describe('countAll', () => {
    it('delegates to model.count()', async () => {
      mockModel.count.mockResolvedValue(5);
      const result = await repo.countAll();
      expect(result).toBe(5);
      expect(mockModel.count).toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('returns paginated invoices', async () => {
      const row = makeRow();
      mockModel.findAndCountAll.mockResolvedValue({ count: 1, rows: [row] });

      const result = await repo.list({ page: 1, limit: 20 });

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toBeInstanceOf(Invoice);
    });

    it('passes offset correctly for page 2', async () => {
      mockModel.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });

      await repo.list({ page: 2, limit: 10 });

      expect(mockModel.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({ offset: 10, limit: 10 }),
      );
    });
  });

  describe('findById', () => {
    it('returns null when not found', async () => {
      mockModel.findByPk.mockResolvedValue(null);
      const result = await repo.findById('missing');
      expect(result).toBeNull();
    });

    it('returns an Invoice when found', async () => {
      mockModel.findByPk.mockResolvedValue(makeRow());
      const result = await repo.findById('inv-1');
      expect(result).toBeInstanceOf(Invoice);
      expect(result?.id).toBe('inv-1');
    });
  });

  describe('save', () => {
    it('creates a row and returns an Invoice entity', async () => {
      const row = makeRow();
      mockModel.create.mockResolvedValue(row);

      const result = await repo.save({
        id: 'inv-1',
        doctorId: 'doc-1',
        invoiceNumber: 'FAC-20260101-0001',
        amount: 100,
        currency: 'USD',
        description: null,
        createdBy: 'admin-1',
      });

      expect(result).toBeInstanceOf(Invoice);
      expect(mockModel.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('markSent', () => {
    it('updates status to sent and returns updated invoice', async () => {
      const sentRow = makeRow({ status: 'sent', sentAt: new Date() });
      mockModel.update.mockResolvedValue([1]);
      mockModel.findByPk.mockResolvedValue(sentRow);

      const result = await repo.markSent('inv-1');

      expect(result.status).toBe('sent');
      expect(mockModel.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'sent' }),
        expect.objectContaining({ where: { id: 'inv-1' } }),
      );
    });
  });

  describe('markPaid', () => {
    it('updates status to paid and returns updated invoice', async () => {
      const paidRow = makeRow({ status: 'paid', paidAt: new Date() });
      mockModel.update.mockResolvedValue([1]);
      mockModel.findByPk.mockResolvedValue(paidRow);

      const result = await repo.markPaid('inv-1');

      expect(result.status).toBe('paid');
      expect(mockModel.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'paid' }),
        expect.objectContaining({ where: { id: 'inv-1' } }),
      );
    });
  });
});
