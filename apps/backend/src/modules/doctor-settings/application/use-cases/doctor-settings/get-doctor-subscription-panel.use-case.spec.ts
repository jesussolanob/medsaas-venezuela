import { Test, type TestingModule } from '@nestjs/testing';
import {
  GetDoctorSubscriptionPanelUseCase,
  type SubscriptionPanelOutput,
} from './get-doctor-subscription-panel.use-case';
import {
  SUBSCRIPTION_PANEL_REPOSITORY,
  type ISubscriptionPanelRepository,
  type SubscriptionPanelData,
} from '../../../domain/repositories/subscription-panel.repository';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const DOCTOR_ID = 'aaaabbbb-cccc-dddd-eeee-ffffffffffff';

const FUTURE_ISO = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

function makeTrialPanelData(overrides: Partial<SubscriptionPanelData> = {}): SubscriptionPanelData {
  return {
    planKey: 'trial',
    planName: 'Beta Privada',
    status: 'trial',
    expiresAt: FUTURE_ISO,
    daysRemaining: 365,
    isExpired: false,
    isInTrial: true,
    basePriceUsd: 0,
    currency: 'USD',
    durationOptions: [],
    paymentMethodsEnabled: ['pago_movil', 'zelle'],
    paymentMethodsConfig: {
      pago_movil: { numero: '04241234567', banco: 'Banesco' },
      zelle: { email: 'pagos@delta.com' },
    },
    stripeEnabled: false,
    payments: [],
    ...overrides,
  };
}

function makeActivePanelData(): SubscriptionPanelData {
  return makeTrialPanelData({
    planKey: 'basic',
    planName: 'Básico',
    status: 'active',
    isInTrial: false,
    basePriceUsd: 10,
    durationOptions: [
      {
        durationMonths: 1,
        basePriceUsd: 10,
        finalPriceUsd: 10,
        discountPct: 0,
        promotionId: null,
        label: null,
      },
      {
        durationMonths: 3,
        basePriceUsd: 30,
        finalPriceUsd: 24,
        discountPct: 20,
        promotionId: 'promo-uuid-1',
        label: '3 meses – 20% OFF',
      },
    ],
    payments: [
      {
        id: 'pay-uuid-1',
        amountUsd: 10,
        durationMonths: 1,
        method: 'zelle',
        referenceNumber: 'REF001',
        status: 'approved',
        createdAt: new Date('2026-06-01T10:00:00.000Z'),
        rejectionReason: null,
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GetDoctorSubscriptionPanelUseCase', () => {
  let useCase: GetDoctorSubscriptionPanelUseCase;
  let mockRepo: jest.Mocked<ISubscriptionPanelRepository>;

  beforeEach(async () => {
    mockRepo = {
      findPanelData: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetDoctorSubscriptionPanelUseCase,
        { provide: SUBSCRIPTION_PANEL_REPOSITORY, useValue: mockRepo },
      ],
    }).compile();

    useCase = module.get(GetDoctorSubscriptionPanelUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  // ---------------------------------------------------------------------------
  // Happy path — trial doctor
  // ---------------------------------------------------------------------------

  describe('trial subscription', () => {
    it('returns the correct state fields for a trial doctor', async () => {
      mockRepo.findPanelData.mockResolvedValue(makeTrialPanelData());

      const result: SubscriptionPanelOutput = await useCase.execute(DOCTOR_ID);

      expect(result.state.plan).toBe('Beta Privada');
      expect(result.state.status).toBe('trial');
      expect(result.state.is_in_trial).toBe(true);
      expect(result.state.is_expired).toBe(false);
      expect(result.state.days_remaining).toBe(365);
    });

    it('passes doctorId to the repository', async () => {
      mockRepo.findPanelData.mockResolvedValue(makeTrialPanelData());

      await useCase.execute(DOCTOR_ID);

      expect(mockRepo.findPanelData).toHaveBeenCalledWith(DOCTOR_ID);
    });

    it('returns empty duration_options when none are configured', async () => {
      mockRepo.findPanelData.mockResolvedValue(makeTrialPanelData({ durationOptions: [] }));

      const result = await useCase.execute(DOCTOR_ID);

      expect(result.pricing.duration_options).toHaveLength(0);
    });

    it('returns empty payments array when no history exists', async () => {
      mockRepo.findPanelData.mockResolvedValue(makeTrialPanelData({ payments: [] }));

      const result = await useCase.execute(DOCTOR_ID);

      expect(result.payments).toHaveLength(0);
    });

    it('sets stripe_enabled to false', async () => {
      mockRepo.findPanelData.mockResolvedValue(makeTrialPanelData());

      const result = await useCase.execute(DOCTOR_ID);

      expect(result.stripe_enabled).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Happy path — active paid subscription with duration options + payments
  // ---------------------------------------------------------------------------

  describe('active paid subscription', () => {
    it('maps duration options to snake_case output shape', async () => {
      mockRepo.findPanelData.mockResolvedValue(makeActivePanelData());

      const result = await useCase.execute(DOCTOR_ID);

      expect(result.pricing.duration_options).toHaveLength(2);

      const monthly = result.pricing.duration_options[0]!;
      expect(monthly.duration_months).toBe(1);
      expect(monthly.base_price_usd).toBe(10);
      expect(monthly.final_price_usd).toBe(10);
      expect(monthly.discount_pct).toBe(0);
      expect(monthly.promotion_id).toBeNull();
      expect(monthly.label).toBeNull();

      const quarterly = result.pricing.duration_options[1]!;
      expect(quarterly.duration_months).toBe(3);
      expect(quarterly.final_price_usd).toBe(24);
      expect(quarterly.discount_pct).toBe(20);
      expect(quarterly.promotion_id).toBe('promo-uuid-1');
      expect(quarterly.label).toBe('3 meses – 20% OFF');
    });

    it('maps payment history items to snake_case output shape', async () => {
      mockRepo.findPanelData.mockResolvedValue(makeActivePanelData());

      const result = await useCase.execute(DOCTOR_ID);

      expect(result.payments).toHaveLength(1);

      const payment = result.payments[0]!;
      expect(payment.id).toBe('pay-uuid-1');
      expect(payment.amount_usd).toBe(10);
      expect(payment.duration_months).toBe(1);
      expect(payment.method).toBe('zelle');
      expect(payment.reference_number).toBe('REF001');
      expect(payment.status).toBe('approved');
      expect(payment.created_at).toBe('2026-06-01T10:00:00.000Z');
      expect(payment.rejection_reason).toBeNull();
    });

    it('returns correct pricing base price and currency', async () => {
      mockRepo.findPanelData.mockResolvedValue(makeActivePanelData());

      const result = await useCase.execute(DOCTOR_ID);

      expect(result.pricing.base_price_usd).toBe(10);
      expect(result.pricing.currency).toBe('USD');
    });

    it('maps payment_methods enabled list and per-method config', async () => {
      mockRepo.findPanelData.mockResolvedValue(makeActivePanelData());

      const result = await useCase.execute(DOCTOR_ID);

      expect(result.payment_methods.enabled).toContain('pago_movil');
      expect(result.payment_methods.enabled).toContain('zelle');
      expect(result.payment_methods.config['pago_movil']).toEqual({
        numero: '04241234567',
        banco: 'Banesco',
      });
      expect(result.payment_methods.config['zelle']).toEqual({
        email: 'pagos@delta.com',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe('expired subscription', () => {
    it('reflects expired state correctly', async () => {
      const expiredData = makeTrialPanelData({
        status: 'past_due',
        isExpired: true,
        isInTrial: false,
        daysRemaining: 0,
        expiresAt: new Date('2025-01-01T00:00:00.000Z').toISOString(),
      });
      mockRepo.findPanelData.mockResolvedValue(expiredData);

      const result = await useCase.execute(DOCTOR_ID);

      expect(result.state.is_expired).toBe(true);
      expect(result.state.days_remaining).toBe(0);
      expect(result.state.status).toBe('past_due');
    });
  });

  describe('null expiresAt (no expiry date)', () => {
    it('maps null expiresAt to null expires_at in output', async () => {
      mockRepo.findPanelData.mockResolvedValue(makeTrialPanelData({ expiresAt: null }));

      const result = await useCase.execute(DOCTOR_ID);

      expect(result.state.expires_at).toBeNull();
    });
  });

  describe('rejected payment in history', () => {
    it('includes rejected payment with rejection_reason null (not stored in payments table)', async () => {
      const dataWithRejected = makeActivePanelData();
      dataWithRejected.payments = [
        {
          id: 'pay-rejected',
          amountUsd: 10,
          durationMonths: 1,
          method: 'transferencia',
          referenceNumber: 'REF002',
          status: 'rejected',
          createdAt: new Date('2026-05-15T08:00:00.000Z'),
          rejectionReason: null,
        },
      ];
      mockRepo.findPanelData.mockResolvedValue(dataWithRejected);

      const result = await useCase.execute(DOCTOR_ID);

      expect(result.payments[0]!.status).toBe('rejected');
      expect(result.payments[0]!.rejection_reason).toBeNull();
    });
  });

  describe('repository propagates errors', () => {
    it('propagates unexpected errors from the repository', async () => {
      mockRepo.findPanelData.mockRejectedValue(new Error('DB connection failed'));

      await expect(useCase.execute(DOCTOR_ID)).rejects.toThrow('DB connection failed');
    });
  });
});
