import { GetDoctorFeaturesUseCase } from './get-doctor-features.use-case';
import type { IDoctorProfileRepository } from '../../../domain/repositories/doctor-profile.repository';
import type {
  IPlanFeaturesRepository,
  PlanFeature,
} from '../../../domain/repositories/plan-features.repository';
import { DoctorProfile } from '../../../domain/entities/doctor-profile.entity';
import { DoctorProfileNotFoundError } from '../../../domain/errors/doctor-profile-not-found.error';

const DOCTOR_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeProfile(plan: string | null): DoctorProfile {
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
    subscriptionStatus: 'active',
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

const BASIC_FEATURES: PlanFeature[] = [
  { featureKey: 'dashboard', featureLabel: 'Dashboard', enabled: true },
  { featureKey: 'crm', featureLabel: 'CRM Pacientes', enabled: true },
];

const PROFESSIONAL_FEATURES: PlanFeature[] = [
  ...BASIC_FEATURES,
  { featureKey: 'reports', featureLabel: 'Reportes', enabled: true },
];

describe('GetDoctorFeaturesUseCase', () => {
  let useCase: GetDoctorFeaturesUseCase;
  let mockProfileRepo: jest.Mocked<IDoctorProfileRepository>;
  let mockFeaturesRepo: jest.Mocked<IPlanFeaturesRepository>;
  let mockRedis: { get: jest.Mock; setex: jest.Mock };

  beforeEach(() => {
    mockProfileRepo = {
      findByDoctorId: jest.fn(),
      update: jest.fn(),
      updateExchangeRate: jest.fn(),
    };
    mockFeaturesRepo = {
      findByPlan: jest.fn(),
    };
    mockRedis = {
      get: jest.fn().mockResolvedValue(null), // no cache by default
      setex: jest.fn().mockResolvedValue('OK'),
    };

    useCase = new GetDoctorFeaturesUseCase(mockProfileRepo, mockFeaturesRepo, mockRedis as never);
  });

  it('returns features for basic plan from DB on cache miss', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile('basic'));
    mockFeaturesRepo.findByPlan.mockResolvedValue(BASIC_FEATURES);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.plan).toBe('basic');
    expect(result.features).toEqual(BASIC_FEATURES);
    expect(mockFeaturesRepo.findByPlan).toHaveBeenCalledWith('basic');
    expect(mockRedis.setex).toHaveBeenCalledWith(
      'features:basic',
      3600,
      JSON.stringify(BASIC_FEATURES),
    );
  });

  it('returns features for professional plan from DB on cache miss', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile('professional'));
    mockFeaturesRepo.findByPlan.mockResolvedValue(PROFESSIONAL_FEATURES);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.plan).toBe('professional');
    expect(result.features).toHaveLength(PROFESSIONAL_FEATURES.length);
  });

  it('reads from Redis cache on second call (cache hit)', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile('basic'));
    mockRedis.get.mockResolvedValue(JSON.stringify(BASIC_FEATURES));

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.features).toEqual(BASIC_FEATURES);
    expect(mockFeaturesRepo.findByPlan).not.toHaveBeenCalled();
  });

  it('falls back to DB when cached value is corrupted JSON', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile('basic'));
    mockRedis.get.mockResolvedValue('not-valid-json{{{');
    mockFeaturesRepo.findByPlan.mockResolvedValue(BASIC_FEATURES);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.features).toEqual(BASIC_FEATURES);
    expect(mockFeaturesRepo.findByPlan).toHaveBeenCalled();
  });

  it('uses trial plan when profile.plan is null', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile(null));
    mockFeaturesRepo.findByPlan.mockResolvedValue([]);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.plan).toBe('trial');
    expect(mockFeaturesRepo.findByPlan).toHaveBeenCalledWith('trial');
  });

  it('throws DoctorProfileNotFoundError when profile is not found', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(null);

    await expect(useCase.execute(DOCTOR_ID)).rejects.toBeInstanceOf(DoctorProfileNotFoundError);
    expect(mockFeaturesRepo.findByPlan).not.toHaveBeenCalled();
  });

  it('degrades gracefully to DB when Redis.get() throws (Redis unavailable)', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile('basic'));
    mockRedis.get.mockRejectedValue(new Error('ECONNREFUSED'));
    mockFeaturesRepo.findByPlan.mockResolvedValue(BASIC_FEATURES);

    // Should not throw — falls back to DB
    const result = await useCase.execute(DOCTOR_ID);

    expect(result.features).toEqual(BASIC_FEATURES);
    expect(mockFeaturesRepo.findByPlan).toHaveBeenCalledWith('basic');
  });

  it('still returns features when Redis.setex() throws (Redis unavailable on write)', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile('basic'));
    mockRedis.get.mockResolvedValue(null); // cache miss
    mockRedis.setex.mockRejectedValue(new Error('ECONNREFUSED'));
    mockFeaturesRepo.findByPlan.mockResolvedValue(BASIC_FEATURES);

    // Should not throw — write failure is non-critical
    const result = await useCase.execute(DOCTOR_ID);

    expect(result.features).toEqual(BASIC_FEATURES);
  });
});
