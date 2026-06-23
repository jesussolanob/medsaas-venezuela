import { SequelizePaymentRepository } from './sequelize-payment.repository';
import { PaymentNotFoundError } from '../../../domain/errors/payment-not-found.error';
import { PaymentNotOwnedError } from '../../../domain/errors/payment-not-owned.error';
import { PaymentItemNotFoundError } from '../../../domain/errors/payment-item-not-found.error';

/**
 * Unit tests for SequelizePaymentRepository.
 *
 * All Sequelize models and the Sequelize instance are fully mocked so tests run
 * without a real database. The key behaviours under test are:
 *   - Correct forwarding of doctorId to WHERE clauses (anti-IDOR)
 *   - Ownership checks (PaymentNotOwnedError, PaymentNotFoundError)
 *   - Transactional: updateStatus, addItem, removeItem wrap their writes
 */

const FAKE_TX = { id: 'mock-tx' };

/** Factory for a minimal PaymentModel-like object returned by Sequelize findOne. */
const makePaymentRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'pay-001',
  doctorId: 'doc-001',
  patientId: 'pat-001',
  amountUsd: '30.00',
  amountBs: null,
  bcvRate: null,
  currency: 'USD',
  methodSnapshot: 'pago_movil',
  paymentReference: null,
  paymentReceiptUrl: null,
  paymentCode: 'BK-001',
  status: 'pending',
  paidAt: null,
  packageId: null,
  createdAt: new Date('2026-06-01'),
  updatedAt: new Date('2026-06-01'),
  ...overrides,
});

/** Factory for a minimal PaymentItemModel-like object. */
const makeItemRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'item-001',
  paymentId: 'pay-001',
  doctorId: 'doc-001',
  name: 'Extra',
  amountUsd: '10.00',
  sourceType: null,
  sourceId: null,
  createdAt: new Date('2026-06-01'),
  updatedAt: new Date('2026-06-01'),
  ...overrides,
});

describe('SequelizePaymentRepository', () => {
  let repo: SequelizePaymentRepository;
  let mockPaymentModel: {
    findOne: jest.Mock;
    findAll: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    destroy?: jest.Mock;
  };
  let mockItemModel: {
    findOne: jest.Mock;
    findAll: jest.Mock;
    create: jest.Mock;
    destroy: jest.Mock;
  };
  let mockSequelize: { query: jest.Mock; transaction: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockPaymentModel = {
      findOne: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    mockItemModel = {
      findOne: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn(),
      destroy: jest.fn(),
    };

    mockSequelize = {
      query: jest.fn().mockResolvedValue([[]]),
      transaction: jest
        .fn()
        .mockImplementation(async (cb: (t: unknown) => Promise<unknown>) => cb(FAKE_TX)),
    };

    repo = new SequelizePaymentRepository(
      mockPaymentModel as unknown as typeof import('../models/payment.model').PaymentModel,
      mockItemModel as unknown as typeof import('../models/payment-item.model').PaymentItemModel,
      mockSequelize as unknown as import('sequelize-typescript').Sequelize,
    );
  });

  // ---------------------------------------------------------------------------
  // findByIdForDoctor
  // ---------------------------------------------------------------------------
  describe('findByIdForDoctor()', () => {
    it('returns a Payment domain entity when found and owned', async () => {
      mockPaymentModel.findOne.mockResolvedValue(makePaymentRow());

      const result = await repo.findByIdForDoctor('pay-001', 'doc-001');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('pay-001');
    });

    it('returns null when payment does not exist', async () => {
      mockPaymentModel.findOne.mockResolvedValue(null);

      const result = await repo.findByIdForDoctor('pay-999', 'doc-001');

      expect(result).toBeNull();
    });

    it('returns null when payment belongs to a different doctor (anti-IDOR)', async () => {
      mockPaymentModel.findOne.mockResolvedValue(makePaymentRow({ doctorId: 'doc-other' }));

      const result = await repo.findByIdForDoctor('pay-001', 'doc-001');

      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // updateStatus
  // ---------------------------------------------------------------------------
  describe('updateStatus()', () => {
    it('throws PaymentNotFoundError when payment does not exist', async () => {
      mockPaymentModel.findOne.mockResolvedValue(null);

      await expect(repo.updateStatus('pay-999', 'doc-001', 'approved')).rejects.toThrow(
        PaymentNotFoundError,
      );
    });

    it('throws PaymentNotOwnedError when payment belongs to another doctor', async () => {
      mockPaymentModel.findOne.mockResolvedValue(makePaymentRow({ doctorId: 'doc-other' }));

      await expect(repo.updateStatus('pay-001', 'doc-001', 'approved')).rejects.toThrow(
        PaymentNotOwnedError,
      );
    });

    it('updates to approved and sets paidAt', async () => {
      mockPaymentModel.findOne.mockResolvedValue(makePaymentRow());
      mockPaymentModel.update.mockResolvedValue([1]);
      mockSequelize.query.mockResolvedValue([[]]); // sync consultations

      const result = await repo.updateStatus('pay-001', 'doc-001', 'approved');

      expect(result.status).toBe('approved');
      expect(result.paidAt).toBeInstanceOf(Date);
      expect(mockPaymentModel.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'approved' }),
        expect.anything(),
      );
    });

    it('updates to pending and clears paidAt', async () => {
      mockPaymentModel.findOne.mockResolvedValue(
        makePaymentRow({ status: 'approved', paidAt: new Date() }),
      );
      mockPaymentModel.update.mockResolvedValue([1]);
      mockSequelize.query.mockResolvedValue([[]]); // sync consultations

      const result = await repo.updateStatus('pay-001', 'doc-001', 'pending');

      expect(result.status).toBe('pending');
      expect(result.paidAt).toBeNull();
    });

    it('wraps writes in a transaction', async () => {
      mockPaymentModel.findOne.mockResolvedValue(makePaymentRow());
      mockPaymentModel.update.mockResolvedValue([1]);
      mockSequelize.query.mockResolvedValue([[]]); // sync consultations

      await repo.updateStatus('pay-001', 'doc-001', 'approved');

      expect(mockSequelize.transaction).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // addItem
  // ---------------------------------------------------------------------------
  describe('addItem()', () => {
    it('inserts item and updates payment total', async () => {
      mockPaymentModel.findOne.mockResolvedValue(makePaymentRow({ amountUsd: '30.00' }));
      mockItemModel.create.mockResolvedValue(makeItemRow());
      mockPaymentModel.update.mockResolvedValue([1]);
      mockSequelize.query.mockResolvedValue([[]]); // sync appointments

      const result = await repo.addItem({
        id: 'item-001',
        paymentId: 'pay-001',
        doctorId: 'doc-001',
        name: 'Extra',
        amountUsd: 10,
      });

      expect(result.name).toBe('Extra');
      // New total = 30 + 10 = 40
      expect(mockPaymentModel.update).toHaveBeenCalledWith(
        expect.objectContaining({ amountUsd: 40 }),
        expect.anything(),
      );
    });

    it('throws PaymentNotFoundError when payment does not exist', async () => {
      mockPaymentModel.findOne.mockResolvedValue(null);

      await expect(
        repo.addItem({
          id: 'item-001',
          paymentId: 'pay-999',
          doctorId: 'doc-001',
          name: 'X',
          amountUsd: 10,
        }),
      ).rejects.toThrow(PaymentNotFoundError);
    });

    it('throws PaymentNotOwnedError when payment belongs to another doctor', async () => {
      mockPaymentModel.findOne.mockResolvedValue(makePaymentRow({ doctorId: 'doc-other' }));

      await expect(
        repo.addItem({
          id: 'item-001',
          paymentId: 'pay-001',
          doctorId: 'doc-001',
          name: 'X',
          amountUsd: 10,
        }),
      ).rejects.toThrow(PaymentNotOwnedError);
    });
  });

  // ---------------------------------------------------------------------------
  // removeItem
  // ---------------------------------------------------------------------------
  describe('removeItem()', () => {
    it('deletes the item and reduces payment total', async () => {
      mockItemModel.findOne.mockResolvedValue(
        makeItemRow({ amountUsd: '10.00', paymentId: 'pay-001' }),
      );
      mockItemModel.destroy.mockResolvedValue(1);
      mockPaymentModel.findOne.mockResolvedValue(makePaymentRow({ amountUsd: '40.00' }));
      mockPaymentModel.update.mockResolvedValue([1]);
      mockSequelize.query.mockResolvedValue([[]]); // sync appointments

      await repo.removeItem('item-001', 'doc-001');

      // New total = 40 - 10 = 30
      expect(mockPaymentModel.update).toHaveBeenCalledWith(
        expect.objectContaining({ amountUsd: 30 }),
        expect.anything(),
      );
    });

    it('throws PaymentItemNotFoundError when item does not exist', async () => {
      mockItemModel.findOne.mockResolvedValue(null);

      await expect(repo.removeItem('item-999', 'doc-001')).rejects.toThrow(
        PaymentItemNotFoundError,
      );
    });

    it('throws PaymentNotOwnedError when item belongs to another doctor', async () => {
      mockItemModel.findOne.mockResolvedValue(makeItemRow({ doctorId: 'doc-other' }));

      await expect(repo.removeItem('item-001', 'doc-001')).rejects.toThrow(PaymentNotOwnedError);
    });

    it('floors total at 0 (never negative)', async () => {
      mockItemModel.findOne.mockResolvedValue(
        makeItemRow({ amountUsd: '50.00', paymentId: 'pay-001' }),
      );
      mockItemModel.destroy.mockResolvedValue(1);
      mockPaymentModel.findOne.mockResolvedValue(makePaymentRow({ amountUsd: '30.00' }));
      mockPaymentModel.update.mockResolvedValue([1]);
      mockSequelize.query.mockResolvedValue([[]]); // sync appointments

      await repo.removeItem('item-001', 'doc-001');

      // max(0, 30 - 50) = 0
      expect(mockPaymentModel.update).toHaveBeenCalledWith(
        expect.objectContaining({ amountUsd: 0 }),
        expect.anything(),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------
  describe('create()', () => {
    it('creates a new payment row', async () => {
      mockPaymentModel.create.mockResolvedValue(makePaymentRow());

      const result = await repo.create({
        id: 'pay-001',
        doctorId: 'doc-001',
        patientId: 'pat-001',
        amountUsd: 30,
      });

      expect(result.id).toBe('pay-001');
      expect(result.doctorId).toBe('doc-001');
      expect(mockPaymentModel.create).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // listForDoctor
  // ---------------------------------------------------------------------------
  describe('listForDoctor()', () => {
    /** Minimal raw row as Sequelize would return it from the JOIN query. */
    const makeListRow = (overrides: Record<string, unknown> = {}) => ({
      id: 'pay-001',
      payment_code: 'BK-001',
      amount_usd: '30.00',
      amount_bs: null,
      status: 'pending',
      paid_at: null,
      method_snapshot: 'pago_movil',
      created_at: '2026-06-01T00:00:00.000Z',
      appt_id: 'appt-001',
      appointment_code: 'BK-20260601-001',
      scheduled_at: '2026-06-01T10:00:00.000Z',
      patient_name: 'María López',
      patient_phone: '+58412345678',
      plan_name: 'Consulta General',
      payment_receipt_url: null,
      consultation_id: null,
      consultation_code: null,
      ...overrides,
    });

    it('maps patient_phone from the appointment join into patientPhone', async () => {
      mockSequelize.query.mockResolvedValue([makeListRow()]);

      const results = await repo.listForDoctor({ doctorId: 'doc-001' });
      const first = results[0];

      expect(results).toHaveLength(1);
      expect(first).toBeDefined();
      expect(first?.appointment?.patientPhone).toBe('+58412345678');
    });

    it('sets patientPhone to null when patient_phone is absent in the row', async () => {
      mockSequelize.query.mockResolvedValue([makeListRow({ patient_phone: null })]);

      const results = await repo.listForDoctor({ doctorId: 'doc-001' });
      const first = results[0];

      expect(first).toBeDefined();
      expect(first?.appointment?.patientPhone).toBeNull();
    });

    it('sets appointment to null when appt_id is null', async () => {
      mockSequelize.query.mockResolvedValue([
        makeListRow({ appt_id: null, appointment_code: null, scheduled_at: null }),
      ]);

      const results = await repo.listForDoctor({ doctorId: 'doc-001' });
      const first = results[0];

      expect(first).toBeDefined();
      expect(first?.appointment).toBeNull();
    });

    it('returns an empty array when the query returns no rows', async () => {
      mockSequelize.query.mockResolvedValue([]);

      const results = await repo.listForDoctor({ doctorId: 'doc-001' });

      expect(results).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // listItems
  // ---------------------------------------------------------------------------
  describe('listItems()', () => {
    it('returns items for a payment owned by the doctor', async () => {
      mockPaymentModel.findOne.mockResolvedValue(makePaymentRow());
      mockItemModel.findAll.mockResolvedValue([makeItemRow(), makeItemRow({ id: 'item-002' })]);

      const result = await repo.listItems('pay-001', 'doc-001');

      expect(result).toHaveLength(2);
    });

    it('throws PaymentNotFoundError when payment does not exist', async () => {
      mockPaymentModel.findOne.mockResolvedValue(null);

      await expect(repo.listItems('pay-999', 'doc-001')).rejects.toThrow(PaymentNotFoundError);
    });

    it('throws PaymentNotOwnedError when payment belongs to another doctor', async () => {
      mockPaymentModel.findOne.mockResolvedValue(makePaymentRow({ doctorId: 'doc-other' }));

      await expect(repo.listItems('pay-001', 'doc-001')).rejects.toThrow(PaymentNotOwnedError);
    });
  });
});
