import { Test, TestingModule } from '@nestjs/testing';
import {
  DoctorSubscriptionPaymentsController,
  CheckoutInfoQuerySchema,
} from './doctor-subscription-payments.controller';
import { GetCheckoutInfoUseCase } from '../../application/use-cases/billing/get-checkout-info.use-case';
import { SubmitDoctorPaymentUseCase } from '../../application/use-cases/billing/submit-doctor-payment.use-case';
import { ListDoctorPaymentsUseCase } from '../../application/use-cases/billing/list-doctor-payments.use-case';
import { SubscriptionPayment } from '../../domain/entities/subscription-payment.entity';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DOCTOR_ID = 'doc-test-123';

function makeUser(overrides: Partial<CurrentUserPayload> = {}): CurrentUserPayload {
  return {
    sub: DOCTOR_ID,
    role: 'doctor',
    email: 'doctor@example.com',
    ...overrides,
  };
}

function makePaymentEntity(
  overrides: Partial<{
    id: string;
    receiptUrl: string | null;
    status: 'pending' | 'approved' | 'rejected';
  }> = {},
): SubscriptionPayment {
  // Use 'receiptUrl' in overrides to distinguish null (explicit) from undefined (not passed)
  const receiptUrl =
    'receiptUrl' in overrides ? overrides.receiptUrl : `receipt/${DOCTOR_ID}/pay.jpg`;

  return SubscriptionPayment.create({
    id: overrides.id ?? 'pay-1',
    doctorId: DOCTOR_ID,
    amountUsd: 10,
    method: 'transfer',
    referenceNumber: 'REF-001',
    durationMonths: 1,
    status: overrides.status ?? 'pending',
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    amountBs: 405,
    bcvRateUsed: 40.5,
    bankCode: '0102',
    receiptUrl,
    planKey: 'delta_plus',
    period: 'monthly',
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DoctorSubscriptionPaymentsController', () => {
  let controller: DoctorSubscriptionPaymentsController;
  let mockGetCheckoutInfo: jest.Mocked<GetCheckoutInfoUseCase>;
  let mockSubmitPayment: jest.Mocked<SubmitDoctorPaymentUseCase>;
  let mockListPayments: jest.Mocked<ListDoctorPaymentsUseCase>;

  beforeEach(async () => {
    mockGetCheckoutInfo = { execute: jest.fn() } as unknown as jest.Mocked<GetCheckoutInfoUseCase>;
    mockSubmitPayment = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<SubmitDoctorPaymentUseCase>;
    mockListPayments = { execute: jest.fn() } as unknown as jest.Mocked<ListDoctorPaymentsUseCase>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DoctorSubscriptionPaymentsController],
      providers: [
        { provide: GetCheckoutInfoUseCase, useValue: mockGetCheckoutInfo },
        { provide: SubmitDoctorPaymentUseCase, useValue: mockSubmitPayment },
        { provide: ListDoctorPaymentsUseCase, useValue: mockListPayments },
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DoctorSubscriptionPaymentsController>(
      DoctorSubscriptionPaymentsController,
    );
  });

  // -------------------------------------------------------------------------
  // GET checkout-info
  // -------------------------------------------------------------------------

  describe('GET /checkout-info', () => {
    it('delegates to GetCheckoutInfoUseCase with planKey and period', async () => {
      const checkoutData = {
        planName: 'Delta Plus',
        planKey: 'delta_plus',
        period: 'monthly',
        amountUsd: 10,
        amountBs: 405,
        bcvRate: 40.5,
        bcvRateDate: '2026-08-05',
        banks: [{ code: '0102', name: 'Banco de Venezuela' }],
        paymentInstructions: 'Pague al número...',
      };
      mockGetCheckoutInfo.execute.mockResolvedValue(checkoutData);

      const result = await controller.checkoutInfo({ planKey: 'delta_plus', period: 'monthly' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(checkoutData);
      expect(mockGetCheckoutInfo.execute).toHaveBeenCalledWith({
        planKey: 'delta_plus',
        period: 'monthly',
      });
    });
  });

  // -------------------------------------------------------------------------
  // CheckoutInfoQuerySchema — validates query params before they reach the use case
  // -------------------------------------------------------------------------

  describe('CheckoutInfoQuerySchema', () => {
    it('accepts a valid planKey + period', () => {
      const result = CheckoutInfoQuerySchema.safeParse({
        planKey: 'delta_plus',
        period: 'monthly',
      });
      expect(result.success).toBe(true);
    });

    it.each(['quarterly', 'semiannual', 'annual'])('accepts period=%s', (period) => {
      const result = CheckoutInfoQuerySchema.safeParse({ planKey: 'delta_plus', period });
      expect(result.success).toBe(true);
    });

    it('rejects a missing planKey', () => {
      const result = CheckoutInfoQuerySchema.safeParse({ period: 'monthly' });
      expect(result.success).toBe(false);
    });

    it('rejects a missing period', () => {
      const result = CheckoutInfoQuerySchema.safeParse({ planKey: 'delta_plus' });
      expect(result.success).toBe(false);
    });

    it('rejects an out-of-enum period with a Spanish error message', () => {
      const result = CheckoutInfoQuerySchema.safeParse({
        planKey: 'delta_plus',
        period: 'weekly',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('período');
      }
    });

    it('rejects unknown query params (strict schema)', () => {
      const result = CheckoutInfoQuerySchema.safeParse({
        planKey: 'delta_plus',
        period: 'monthly',
        extra: 'nope',
      });
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // POST /
  // -------------------------------------------------------------------------

  describe('POST /', () => {
    it('delegates to SubmitDoctorPaymentUseCase with doctorId from auth token', async () => {
      const output = {
        id: 'pay-new',
        status: 'pending' as const,
        amountUsd: 10,
        amountBs: 405,
        bcvRate: 40.5,
      };
      mockSubmitPayment.execute.mockResolvedValue(output);

      const body = {
        planKey: 'delta_plus',
        period: 'monthly' as const,
        bankCode: '0102',
        referenceNumber: 'REF-001',
        receiptPath: `receipt/${DOCTOR_ID}/rec.jpg`,
        notes: undefined,
      };
      const result = await controller.submit(body, makeUser());

      expect(result.success).toBe(true);
      expect(result.data).toEqual(output);
      // CRITICAL: doctorId must come from user.sub, not from body
      expect(mockSubmitPayment.execute).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: DOCTOR_ID }),
      );
    });

    it('NEVER passes amount fields to the use case (anti-client-amount rule)', async () => {
      mockSubmitPayment.execute.mockResolvedValue({
        id: 'pay-new',
        status: 'pending',
        amountUsd: 10,
        amountBs: 405,
        bcvRate: 40.5,
      });

      const body = {
        planKey: 'delta_plus',
        period: 'monthly' as const,
        bankCode: '0102',
        referenceNumber: 'REF-001',
        receiptPath: `receipt/${DOCTOR_ID}/rec.jpg`,
      };
      await controller.submit(body, makeUser());

      const passedInput = mockSubmitPayment.execute.mock.calls[0]![0]!;
      // The use case input must NOT contain amountUsd, amountBs, or bcvRate fields
      expect(passedInput).not.toHaveProperty('amountUsd');
      expect(passedInput).not.toHaveProperty('amountBs');
      expect(passedInput).not.toHaveProperty('bcvRate');
    });
  });

  // -------------------------------------------------------------------------
  // GET /
  // -------------------------------------------------------------------------

  describe('GET /', () => {
    it('returns paginated list with hasReceipt instead of raw receiptUrl', async () => {
      const payment = makePaymentEntity({ receiptUrl: `receipt/${DOCTOR_ID}/pay.jpg` });
      mockListPayments.execute.mockResolvedValue({
        items: [payment],
        total: 1,
        page: 1,
        limit: 20,
      });

      const result = await controller.list(makeUser(), '1', '20');

      expect(result.success).toBe(true);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20 });
      expect(result.data).toHaveLength(1);

      const item = result.data[0] as Record<string, unknown>;
      // hasReceipt should be true because receiptUrl is set
      expect(item['hasReceipt']).toBe(true);
      // Raw GCS path must NEVER be exposed
      expect(item).not.toHaveProperty('receiptUrl');
    });

    it('sets hasReceipt to false when payment has no comprobante', async () => {
      const payment = makePaymentEntity({ receiptUrl: null });
      mockListPayments.execute.mockResolvedValue({
        items: [payment],
        total: 1,
        page: 1,
        limit: 20,
      });

      const result = await controller.list(makeUser(), '1', '20');

      const item = result.data[0] as Record<string, unknown>;
      expect(item['hasReceipt']).toBe(false);
    });

    it('passes doctorId from auth token (anti-IDOR: never uses query param)', async () => {
      mockListPayments.execute.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      await controller.list(makeUser({ sub: 'specific-doctor-id' }), '1', '20');

      expect(mockListPayments.execute).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: 'specific-doctor-id' }),
      );
    });

    it('clamps limit to 50 and page to minimum 1', async () => {
      mockListPayments.execute.mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 });

      await controller.list(makeUser(), '0', '999');

      expect(mockListPayments.execute).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 50 }),
      );
    });
  });
});
