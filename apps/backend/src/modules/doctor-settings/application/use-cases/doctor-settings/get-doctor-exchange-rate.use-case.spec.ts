import { GetDoctorExchangeRateUseCase } from './get-doctor-exchange-rate.use-case';
import { DoctorProfileNotFoundError } from '../../../domain/errors/doctor-profile-not-found.error';
import type { IDoctorProfileRepository } from '../../../domain/repositories/doctor-profile.repository';
import type { IUsdtRateStore } from '../../../../finances/domain/repositories/usdt-rate.store';
import { DoctorProfile } from '../../../domain/entities/doctor-profile.entity';

const DOCTOR_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeProfile(
  overrides: Partial<ConstructorParameters<typeof DoctorProfile>[0]> = {},
): DoctorProfile {
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
    plan: 'basic',
    subscriptionStatus: 'active',
    logoUrl: null,
    signatureUrl: null,
    licenseNumber: null,
    currencyMode: 'usd_bcv',
    customRate: null,
    customRateLabel: null,
    ...overrides,
  });
}

describe('GetDoctorExchangeRateUseCase', () => {
  let useCase: GetDoctorExchangeRateUseCase;
  let mockProfileRepo: jest.Mocked<IDoctorProfileRepository>;
  let mockRateStore: jest.Mocked<IUsdtRateStore>;

  beforeEach(() => {
    mockProfileRepo = {
      findByDoctorId: jest.fn(),
      update: jest.fn(),
      updateExchangeRate: jest.fn(),
    };
    mockRateStore = {
      getRate: jest.fn(),
      setRate: jest.fn(),
    };
    useCase = new GetDoctorExchangeRateUseCase(mockProfileRepo, mockRateStore);
  });

  it('throws DoctorProfileNotFoundError when profile does not exist', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(null);

    await expect(useCase.execute(DOCTOR_ID)).rejects.toBeInstanceOf(DoctorProfileNotFoundError);
  });

  it('returns custom rate when mode is custom and customRate is set', async () => {
    const profile = makeProfile({ currencyMode: 'custom', customRate: 45.5, customRateLabel: 'Clínica' });
    mockProfileRepo.findByDoctorId.mockResolvedValue(profile);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.mode).toBe('custom');
    expect(result.rate).toBe(45.5);
    expect(result.label).toBe('Clínica');
    expect(mockRateStore.getRate).not.toHaveBeenCalled();
  });

  it('returns global rate when mode is usd_bcv', async () => {
    const profile = makeProfile({ currencyMode: 'usd_bcv' });
    mockProfileRepo.findByDoctorId.mockResolvedValue(profile);
    mockRateStore.getRate.mockResolvedValue(36.75);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.mode).toBe('usd_bcv');
    expect(result.rate).toBe(36.75);
    expect(result.label).toContain('USD');
  });

  it('returns null rate when mode is usd_bcv and no global rate is configured', async () => {
    const profile = makeProfile({ currencyMode: 'usd_bcv' });
    mockProfileRepo.findByDoctorId.mockResolvedValue(profile);
    mockRateStore.getRate.mockResolvedValue(null);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.rate).toBeNull();
  });

  it('returns eur label when mode is eur_bcv', async () => {
    const profile = makeProfile({ currencyMode: 'eur_bcv' });
    mockProfileRepo.findByDoctorId.mockResolvedValue(profile);
    mockRateStore.getRate.mockResolvedValue(40.0);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.mode).toBe('eur_bcv');
    expect(result.label).toContain('EUR');
  });

  it('falls back to usd_bcv when currencyMode is null', async () => {
    const profile = makeProfile({ currencyMode: null });
    mockProfileRepo.findByDoctorId.mockResolvedValue(profile);
    mockRateStore.getRate.mockResolvedValue(35.0);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.mode).toBe('usd_bcv');
  });
});
