import { SequelizeBillingDocumentRepository } from './sequelize-billing-document.repository';
import { BillingDocument } from '../../../domain/entities/billing-document.entity';

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'bd-1',
    docNumber: 'FACTURA-20260101-0001',
    docType: 'factura',
    doctorId: 'dr-1',
    consultationId: null,
    paymentId: null,
    patientId: null,
    items: [],
    subtotal: null,
    total: '100.00',
    ivaAmount: '0.00',
    igtfAmount: '0.00',
    bcvRate: null,
    totalBs: null,
    notes: null,
    currency: 'USD',
    status: 'issued',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('SequelizeBillingDocumentRepository', () => {
  let mockModel: {
    count: jest.Mock;
    findAndCountAll: jest.Mock;
    create: jest.Mock;
  };
  let repo: SequelizeBillingDocumentRepository;

  beforeEach(() => {
    mockModel = {
      count: jest.fn(),
      findAndCountAll: jest.fn(),
      create: jest.fn(),
    };
    repo = new SequelizeBillingDocumentRepository(
      mockModel as unknown as typeof import('../models/billing-document.model').BillingDocumentModel,
    );
  });

  describe('countByType', () => {
    it('calls model.count with docType filter', async () => {
      mockModel.count.mockResolvedValue(3);
      const result = await repo.countByType('factura');
      expect(result).toBe(3);
      expect(mockModel.count).toHaveBeenCalledWith({ where: { docType: 'factura' } });
    });
  });

  describe('listForDoctor', () => {
    it('returns paginated documents scoped to doctorId', async () => {
      const row = makeRow();
      mockModel.findAndCountAll.mockResolvedValue({ count: 1, rows: [row] });

      const result = await repo.listForDoctor({ doctorId: 'dr-1', page: 1, limit: 20 });

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toBeInstanceOf(BillingDocument);
      expect(mockModel.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({ where: { doctorId: 'dr-1' } }),
      );
    });

    it('calculates offset correctly for page 3', async () => {
      mockModel.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });

      await repo.listForDoctor({ doctorId: 'dr-1', page: 3, limit: 10 });

      expect(mockModel.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({ offset: 20 }),
      );
    });
  });

  describe('save', () => {
    it('creates and returns a BillingDocument entity', async () => {
      const row = makeRow();
      mockModel.create.mockResolvedValue(row);

      const result = await repo.save({
        id: 'bd-1',
        docNumber: 'FACTURA-20260101-0001',
        docType: 'factura',
        doctorId: 'dr-1',
        consultationId: null,
        paymentId: null,
        patientId: null,
        items: [],
        subtotal: null,
        total: 100,
        ivaAmount: 0,
        igtfAmount: 0,
        bcvRate: null,
        totalBs: null,
        notes: null,
        currency: 'USD',
        status: 'issued',
      });

      expect(result).toBeInstanceOf(BillingDocument);
      expect(mockModel.create).toHaveBeenCalledTimes(1);
    });

    it('converts numeric strings from DB to numbers', async () => {
      const row = makeRow({ total: '250.50', ivaAmount: '40.08', igtfAmount: '7.52' });
      mockModel.create.mockResolvedValue(row);

      const result = await repo.save({
        id: 'bd-1',
        docNumber: 'FACTURA-20260101-0001',
        docType: 'factura',
        doctorId: 'dr-1',
        consultationId: null,
        paymentId: null,
        patientId: null,
        items: [],
        subtotal: null,
        total: 250.5,
        ivaAmount: 40.08,
        igtfAmount: 7.52,
        bcvRate: null,
        totalBs: null,
        notes: null,
        currency: 'USD',
        status: 'issued',
      });

      expect(result.total).toBe(250.5);
      expect(result.ivaAmount).toBe(40.08);
      expect(result.igtfAmount).toBe(7.52);
    });
  });
});
