import { GetDoctorFeaturesV2UseCase } from './get-doctor-features-v2.use-case';
import type { IDoctorProfileRepository } from '../../../domain/repositories/doctor-profile.repository';
import type {
  IPlanFeaturesRepository,
  PlanFeature,
} from '../../../domain/repositories/plan-features.repository';
import type {
  IPlanConfigRepository,
  PlanConfigSummary,
} from '../../../domain/repositories/plan-config.repository';
import { DoctorProfile } from '../../../domain/entities/doctor-profile.entity';
import { DoctorProfileNotFoundError } from '../../../domain/errors/doctor-profile-not-found.error';

const DOCTOR_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeProfile(plan: string | null, subscriptionStatus: string | null): DoctorProfile {
  return DoctorProfile.create({
    id: DOCTOR_ID,
    fullName: 'Dr. Test',
    email: 'test@example.com',
    specialty: null,
    professionalTitle: null,
    clinicId: null,
    clinicRole: null,
    paymentMethods: [],
    paymentDetails: {},
    allowsOnline: false,
    officeAddress: null,
    city: null,
    avatarUrl: null,
    plan,
    subscriptionStatus,
    logoUrl: null,
    signatureUrl: null,
    licenseNumber: null,
    phone: null,
    currencyMode: 'usd_bcv',
    customRate: null,
    customRateLabel: null,
    cedula: null,
    birthDate: null,
    onboardingCompleted: true,
  });
}

const FREE_FEATURES: PlanFeature[] = [
  { featureKey: 'dashboard', featureLabel: 'Dashboard', enabled: true },
  { featureKey: 'ai_assistant', featureLabel: 'Asistente IA', enabled: false },
];

const BASE_FEATURES: PlanFeature[] = [
  { featureKey: 'dashboard', featureLabel: 'Dashboard', enabled: true },
  { featureKey: 'reports', featureLabel: 'Reportes', enabled: true },
  { featureKey: 'ai_assistant', featureLabel: 'Asistente IA', enabled: false },
];

const FREE_CONFIG: PlanConfigSummary = {
  planKey: 'delta_free',
  roleKey: 'doctor',
  isPermanent: true,
  isActive: true,
};

const BASE_CONFIG: PlanConfigSummary = {
  planKey: 'delta_base',
  roleKey: 'doctor',
  isPermanent: false,
  isActive: true,
};

describe('GetDoctorFeaturesV2UseCase', () => {
  let useCase: GetDoctorFeaturesV2UseCase;
  let mockProfileRepo: jest.Mocked<IDoctorProfileRepository>;
  let mockFeaturesRepo: jest.Mocked<IPlanFeaturesRepository>;
  let mockPlanConfigRepo: jest.Mocked<IPlanConfigRepository>;
  let mockRedis: { get: jest.Mock; setex: jest.Mock };

  beforeEach(() => {
    mockProfileRepo = {
      findByDoctorId: jest.fn(),
      update: jest.fn(),
      updateExchangeRate: jest.fn(),
      markOnboardingCompleted: jest.fn().mockResolvedValue(undefined),
      updateBlocksLayout: jest.fn().mockResolvedValue(undefined),
    };
    mockFeaturesRepo = { findByPlan: jest.fn() };
    mockPlanConfigRepo = {
      findByKey: jest.fn(),
      findPermanentPlanForRole: jest.fn(),
    };
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
    };

    useCase = new GetDoctorFeaturesV2UseCase(
      mockProfileRepo,
      mockFeaturesRepo,
      mockPlanConfigRepo,
      mockRedis as never,
    );
  });

  // -----------------------------------------------------------------------
  // Happy path — active subscription, non-permanent plan
  // -----------------------------------------------------------------------

  it('returns features for active subscription without downgrade', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile('delta_base', 'active'));
    mockPlanConfigRepo.findByKey.mockResolvedValue(BASE_CONFIG);
    mockFeaturesRepo.findByPlan.mockResolvedValue(BASE_FEATURES);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.plan_key).toBe('delta_base');
    expect(result.effective_plan_key).toBe('delta_base');
    expect(result.is_downgraded).toBe(false);
    expect(result.features['dashboard']).toBe(true);
    expect(result.features['ai_assistant']).toBe(false);
  });

  it('returns features for trial subscription without downgrade', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile('delta_base', 'trial'));
    mockPlanConfigRepo.findByKey.mockResolvedValue(BASE_CONFIG);
    mockFeaturesRepo.findByPlan.mockResolvedValue(BASE_FEATURES);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.is_downgraded).toBe(false);
    expect(result.effective_plan_key).toBe('delta_base');
  });

  // -----------------------------------------------------------------------
  // Permanent plan — never expires
  // -----------------------------------------------------------------------

  it('never downgrades a permanent plan regardless of subscription status', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile('delta_free', 'cancelled'));
    mockPlanConfigRepo.findByKey.mockResolvedValue(FREE_CONFIG);
    mockFeaturesRepo.findByPlan.mockResolvedValue(FREE_FEATURES);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.plan_key).toBe('delta_free');
    expect(result.effective_plan_key).toBe('delta_free');
    expect(result.is_downgraded).toBe(false);
    // findPermanentPlanForRole should NOT be called — isPermanent short-circuits
    expect(mockPlanConfigRepo.findPermanentPlanForRole).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Lazy downgrade
  // -----------------------------------------------------------------------

  it('downgrades to permanent plan when subscription is past_due', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile('delta_base', 'past_due'));
    mockPlanConfigRepo.findByKey.mockResolvedValue(BASE_CONFIG);
    mockPlanConfigRepo.findPermanentPlanForRole.mockResolvedValue(FREE_CONFIG);
    mockFeaturesRepo.findByPlan.mockResolvedValue(FREE_FEATURES);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.plan_key).toBe('delta_base');
    expect(result.effective_plan_key).toBe('delta_free');
    expect(result.is_downgraded).toBe(true);
    expect(mockFeaturesRepo.findByPlan).toHaveBeenCalledWith('delta_free');
  });

  it('downgrades to permanent plan when subscription is suspended', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile('delta_plus', 'suspended'));
    mockPlanConfigRepo.findByKey.mockResolvedValue({
      planKey: 'delta_plus',
      roleKey: 'doctor',
      isPermanent: false,
      isActive: true,
    });
    mockPlanConfigRepo.findPermanentPlanForRole.mockResolvedValue(FREE_CONFIG);
    mockFeaturesRepo.findByPlan.mockResolvedValue(FREE_FEATURES);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.is_downgraded).toBe(true);
    expect(result.effective_plan_key).toBe('delta_free');
  });

  it('falls back to delta_free when no permanent plan is configured in DB', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile('delta_base', 'cancelled'));
    mockPlanConfigRepo.findByKey.mockResolvedValue(BASE_CONFIG);
    mockPlanConfigRepo.findPermanentPlanForRole.mockResolvedValue(null); // no permanent plan
    mockFeaturesRepo.findByPlan.mockResolvedValue(FREE_FEATURES);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.effective_plan_key).toBe('delta_free');
    expect(result.is_downgraded).toBe(true);
  });

  it('downgrades when subscription status is null (unknown)', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile('delta_base', null));
    mockPlanConfigRepo.findByKey.mockResolvedValue(BASE_CONFIG);
    mockPlanConfigRepo.findPermanentPlanForRole.mockResolvedValue(FREE_CONFIG);
    mockFeaturesRepo.findByPlan.mockResolvedValue(FREE_FEATURES);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.is_downgraded).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Null plan — default to delta_free
  // -----------------------------------------------------------------------

  it('defaults to delta_free when profile.plan is null', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile(null, 'active'));
    mockPlanConfigRepo.findByKey.mockResolvedValue(FREE_CONFIG); // delta_free is permanent
    mockFeaturesRepo.findByPlan.mockResolvedValue(FREE_FEATURES);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.plan_key).toBe('delta_free');
    expect(result.is_downgraded).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Error
  // -----------------------------------------------------------------------

  it('throws DoctorProfileNotFoundError when profile does not exist', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(null);

    await expect(useCase.execute(DOCTOR_ID)).rejects.toBeInstanceOf(DoctorProfileNotFoundError);
  });

  // -----------------------------------------------------------------------
  // Redis resilience
  // -----------------------------------------------------------------------

  it('degrades gracefully when Redis.get() throws', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile('delta_base', 'active'));
    mockPlanConfigRepo.findByKey.mockResolvedValue(BASE_CONFIG);
    mockRedis.get.mockRejectedValue(new Error('ECONNREFUSED'));
    mockFeaturesRepo.findByPlan.mockResolvedValue(BASE_FEATURES);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.effective_plan_key).toBe('delta_base');
    expect(result.is_downgraded).toBe(false);
  });

  it('still returns features when Redis.setex() throws on write', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile('delta_base', 'active'));
    mockPlanConfigRepo.findByKey.mockResolvedValue(BASE_CONFIG);
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockRejectedValue(new Error('ECONNREFUSED'));
    mockFeaturesRepo.findByPlan.mockResolvedValue(BASE_FEATURES);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.effective_plan_key).toBe('delta_base');
    expect(result.features['dashboard']).toBe(true);
  });

  it('reads plan config from Redis cache on hit', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile('delta_base', 'active'));
    // First get call is for plan_config, second for features
    mockRedis.get
      .mockResolvedValueOnce(JSON.stringify({ isPermanent: false, roleKey: 'doctor' }))
      .mockResolvedValueOnce(JSON.stringify(BASE_FEATURES));

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.effective_plan_key).toBe('delta_base');
    // DB should not be called for plan config or features
    expect(mockPlanConfigRepo.findByKey).not.toHaveBeenCalled();
    expect(mockFeaturesRepo.findByPlan).not.toHaveBeenCalled();
  });
});
