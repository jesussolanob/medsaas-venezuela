import { SubmitDoctorPaymentUseCase } from './submit-doctor-payment.use-case';
import { PendingPaymentExistsError } from '../../../domain/errors/pending-payment-exists.error';
import { ReceiptPathNotOwnedError } from '../../../domain/errors/receipt-path-not-owned.error';
import { SubscriptionPayment } from '../../../domain/entities/subscription-payment.entity';
import type { ISubscriptionPaymentRepository } from '../../../domain/repositories/subscription-payment.repository';
import type { IPlatformRateProvider } from '../../../domain/repositories/platform-rate.provider';
import type { IPlanPriceProvider } from '../../../domain/repositories/plan-price.provider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DOCTOR_ID = 'doc-abc-123';
const VALID_RECEIPT_PATH = `receipt/${DOCTOR_ID}/pay-receipt.jpg`;

function makeInput(
  overrides: Partial<{
    doctorId: string;
    receiptPath: string;
    period: string;
  }> = {},
) {
  return {
    doctorId: overrides.doctorId ?? DOCTOR_ID,
    planKey: 'delta_plus',
    period: overrides.period ?? 'monthly',
    bankCode: '0102',
    referenceNumber: 'REF-001',
    receiptPath: overrides.receiptPath ?? VALID_RECEIPT_PATH,
    notes: undefined,
  };
}

function makeRepo(): jest.Mocked<ISubscriptionPaymentRepository> {
  const savedPayment = SubscriptionPayment.create({
    id: 'pay-uuid',
    doctorId: DOCTOR_ID,
    amountUsd: 10,
    method: 'transfer',
    referenceNumber: 'REF-001',
    durationMonths: 1,
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    amountBs: 405,
    bcvRateUsed: 40.5,
    bankCode: '0102',
    receiptUrl: VALID_RECEIPT_PATH,
    notes: null,
    planKey: 'delta_plus',
    period: 'monthly',
  });

  return {
    list: jest.fn(),
    listByDoctor: jest.fn(),
    findById: jest.fn(),
    findPendingByDoctor: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
    saveDoctorPayment: jest.fn().mockResolvedValue(savedPayment),
    approveAndExtend: jest.fn(),
    saveApprovedAndExtend: jest.fn(),
    reject: jest.fn(),
    getFinanceStats: jest.fn(),
  };
}

function makeRateProvider(rate = 40.5): jest.Mocked<IPlatformRateProvider> {
  return {
    getEffectiveRate: jest.fn().mockResolvedValue({ rate, rateDate: '2026-08-05' }),
  };
}

function makePlanPriceProvider(priceUsd = 10): jest.Mocked<IPlanPriceProvider> {
  return {
    getActivePlanPrice: jest.fn().mockResolvedValue({
      planKey: 'delta_plus',
      planName: 'Delta Plus',
      period: 'monthly',
      priceUsd,
    }),
    getPaymentInstructions: jest.fn().mockResolvedValue(''),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SubmitDoctorPaymentUseCase', () => {
  describe('Anti-IDOR: receipt path ownership', () => {
    it('rejects a receiptPath that does not start with "receipt/{doctorId}/"', async () => {
      const repo = makeRepo();
      const rateProvider = makeRateProvider();
      const planProvider = makePlanPriceProvider();
      const useCase = new SubmitDoctorPaymentUseCase(repo, rateProvider, planProvider);

      await expect(
        useCase.execute(makeInput({ receiptPath: `receipt/other-doctor/pay.jpg` })),
      ).rejects.toThrow(ReceiptPathNotOwnedError);

      // No DB writes should happen when IDOR check fails
      expect(repo.findPendingByDoctor).not.toHaveBeenCalled();
      expect(repo.saveDoctorPayment).not.toHaveBeenCalled();
    });

    it('rejects a receiptPath that is a different doctorId prefix', async () => {
      const repo = makeRepo();
      const rateProvider = makeRateProvider();
      const planProvider = makePlanPriceProvider();
      const useCase = new SubmitDoctorPaymentUseCase(repo, rateProvider, planProvider);

      // Attempt to use another doctor's receipt
      const input = makeInput({
        doctorId: DOCTOR_ID,
        receiptPath: `receipt/other-${DOCTOR_ID}/pay.jpg`, // wrong prefix
      });

      await expect(useCase.execute(input)).rejects.toThrow(ReceiptPathNotOwnedError);
    });

    it('accepts a receiptPath that starts with "receipt/{doctorId}/"', async () => {
      const repo = makeRepo();
      const rateProvider = makeRateProvider();
      const planProvider = makePlanPriceProvider();
      const useCase = new SubmitDoctorPaymentUseCase(repo, rateProvider, planProvider);

      const result = await useCase.execute(makeInput());

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });
  });

  describe('Anti-spam: one pending payment at a time', () => {
    it('throws PendingPaymentExistsError when a pending payment already exists', async () => {
      const repo = makeRepo();
      const existingPending = SubscriptionPayment.create({
        id: 'old-pay',
        doctorId: DOCTOR_ID,
        amountUsd: 10,
        method: 'transfer',
        referenceNumber: 'OLD-REF',
        durationMonths: 1,
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      repo.findPendingByDoctor.mockResolvedValue(existingPending);

      const rateProvider = makeRateProvider();
      const planProvider = makePlanPriceProvider();
      const useCase = new SubmitDoctorPaymentUseCase(repo, rateProvider, planProvider);

      await expect(useCase.execute(makeInput())).rejects.toThrow(PendingPaymentExistsError);
      expect(repo.saveDoctorPayment).not.toHaveBeenCalled();
    });

    it('allows submission when no pending payment exists', async () => {
      const repo = makeRepo();
      repo.findPendingByDoctor.mockResolvedValue(null);

      const rateProvider = makeRateProvider();
      const planProvider = makePlanPriceProvider();
      const useCase = new SubmitDoctorPaymentUseCase(repo, rateProvider, planProvider);

      const result = await useCase.execute(makeInput());

      expect(result.status).toBe('pending');
      expect(repo.saveDoctorPayment).toHaveBeenCalledTimes(1);
    });
  });

  describe('Race condition — the DB unique constraint is the real guard', () => {
    // The pre-check (findPendingByDoctor) is a fast path only. Under a race,
    // two concurrent requests can both pass it; the DB-level unique partial
    // index uq_subscription_payments_one_pending_per_doctor is what actually
    // prevents the second insert, and SequelizeSubscriptionPaymentRepository
    // translates that violation into PendingPaymentExistsError (see its spec).
    // Here we verify the use case does not swallow or alter that error — it
    // must propagate exactly as thrown by the repository.

    it('propagates PendingPaymentExistsError thrown by saveDoctorPayment even when the pre-check found nothing pending', async () => {
      const repo = makeRepo();
      repo.findPendingByDoctor.mockResolvedValue(null); // pre-check passes (race window)
      repo.saveDoctorPayment.mockRejectedValue(new PendingPaymentExistsError());

      const rateProvider = makeRateProvider();
      const planProvider = makePlanPriceProvider();
      const useCase = new SubmitDoctorPaymentUseCase(repo, rateProvider, planProvider);

      await expect(useCase.execute(makeInput())).rejects.toThrow(PendingPaymentExistsError);
      // The pre-check DID run and DID pass — the DB constraint is the only
      // thing that caught the race in this scenario.
      expect(repo.findPendingByDoctor).toHaveBeenCalledTimes(1);
      expect(repo.saveDoctorPayment).toHaveBeenCalledTimes(1);
    });

    it('normal path still succeeds when both the pre-check and the insert are clean', async () => {
      const repo = makeRepo();
      repo.findPendingByDoctor.mockResolvedValue(null);

      const rateProvider = makeRateProvider();
      const planProvider = makePlanPriceProvider();
      const useCase = new SubmitDoctorPaymentUseCase(repo, rateProvider, planProvider);

      const result = await useCase.execute(makeInput());

      expect(result.status).toBe('pending');
      expect(repo.findPendingByDoctor).toHaveBeenCalledWith(DOCTOR_ID);
      expect(repo.saveDoctorPayment).toHaveBeenCalledTimes(1);
    });
  });

  describe('Server-side amount calculation', () => {
    it('calculates amountBs as round(amountUsd * bcvRate, 2)', async () => {
      const repo = makeRepo();
      const rateProvider = makeRateProvider(40.5);
      const planProvider = makePlanPriceProvider(10);
      const useCase = new SubmitDoctorPaymentUseCase(repo, rateProvider, planProvider);

      await useCase.execute(makeInput());

      const saveArgs = repo.saveDoctorPayment.mock.calls[0]![0]!;
      expect(saveArgs.amountUsd).toBe(10);
      expect(saveArgs.bcvRateUsed).toBe(40.5);
      // 10 * 40.5 = 405.00
      expect(saveArgs.amountBs).toBe(405);
    });

    it('never uses a client-supplied amount (amounts not in SubmitDoctorPaymentInput)', async () => {
      // The use case input intentionally has no amountUsd / amountBs fields.
      // This test documents and enforces that invariant.
      const repo = makeRepo();
      const rateProvider = makeRateProvider(45.0);
      const planProvider = makePlanPriceProvider(25);
      const useCase = new SubmitDoctorPaymentUseCase(repo, rateProvider, planProvider);

      await useCase.execute(makeInput());

      const saveArgs = repo.saveDoctorPayment.mock.calls[0]![0]!;
      // Only server-calculated amounts must reach the repo
      expect(saveArgs.amountUsd).toBe(25); // from planProvider
      expect(saveArgs.bcvRateUsed).toBe(45.0); // from rateProvider
      expect(saveArgs.amountBs).toBe(Math.round(25 * 45.0 * 100) / 100);
    });

    it('stores the doctorId from input (from auth token), never fabricates it', async () => {
      const repo = makeRepo();
      const rateProvider = makeRateProvider();
      const planProvider = makePlanPriceProvider();
      const useCase = new SubmitDoctorPaymentUseCase(repo, rateProvider, planProvider);

      const customDoctorId = 'doctor-xyz-999';
      const validPath = `receipt/${customDoctorId}/rec.pdf`;

      // Update savedPayment mock for this custom doctor
      const savedPayment = SubscriptionPayment.create({
        id: 'pay-uuid',
        doctorId: customDoctorId,
        amountUsd: 10,
        method: 'transfer',
        referenceNumber: 'REF-001',
        durationMonths: 1,
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      repo.saveDoctorPayment.mockResolvedValue(savedPayment);

      await useCase.execute(makeInput({ doctorId: customDoctorId, receiptPath: validPath }));

      const saveArgs = repo.saveDoctorPayment.mock.calls[0]![0]!;
      expect(saveArgs.doctorId).toBe(customDoctorId);
    });
  });

  describe('Period → durationMonths mapping', () => {
    const periodCases: Array<[string, number]> = [
      ['monthly', 1],
      ['quarterly', 3],
      ['semiannual', 6],
      ['annual', 12],
    ];

    it.each(periodCases)('period "%s" maps to %d months', async (period, expectedMonths) => {
      const repo = makeRepo();
      const rateProvider = makeRateProvider();
      const planProvider = makePlanPriceProvider();
      const planProviderWithPeriod: jest.Mocked<IPlanPriceProvider> = {
        getActivePlanPrice: jest.fn().mockResolvedValue({
          planKey: 'delta_plus',
          planName: 'Delta Plus',
          period,
          priceUsd: 10,
        }),
        getPaymentInstructions: planProvider.getPaymentInstructions,
      };
      const useCase = new SubmitDoctorPaymentUseCase(repo, rateProvider, planProviderWithPeriod);

      await useCase.execute(makeInput({ period }));

      const saveArgs = repo.saveDoctorPayment.mock.calls[0]![0]!;
      expect(saveArgs.durationMonths).toBe(expectedMonths);
    });
  });

  describe('Output', () => {
    it('returns the payment id, status "pending", amountUsd, amountBs and bcvRate', async () => {
      const repo = makeRepo();
      const rateProvider = makeRateProvider(40.5);
      const planProvider = makePlanPriceProvider(10);
      const useCase = new SubmitDoctorPaymentUseCase(repo, rateProvider, planProvider);

      const result = await useCase.execute(makeInput());

      expect(result.status).toBe('pending');
      expect(result.amountUsd).toBe(10);
      expect(result.bcvRate).toBe(40.5);
      expect(result.id).toBeDefined();
    });
  });
});
