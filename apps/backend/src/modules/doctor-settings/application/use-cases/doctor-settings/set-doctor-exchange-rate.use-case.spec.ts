import { SetDoctorExchangeRateUseCase } from './set-doctor-exchange-rate.use-case';
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
    phone: null,
    currencyMode: 'usd_bcv',
    customRate: null,
    customRateLabel: null,
    cedula: null,
    birthDate: null,
    ...overrides,
  });
}

describe('SetDoctorExchangeRateUseCase', () => {
  let useCase: SetDoctorExchangeRateUseCase;
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
      setSource: jest.fn(),
      getRatesSummary: jest.fn(),
    } as unknown as jest.Mocked<IUsdtRateStore>;
    useCase = new SetDoctorExchangeRateUseCase(mockProfileRepo, mockRateStore);
  });

  it('throws DoctorProfileNotFoundError when profile does not exist', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(null);

    await expect(
      useCase.execute(DOCTOR_ID, { mode: 'usd_bcv', customRate: null, customRateLabel: null }),
    ).rejects.toBeInstanceOf(DoctorProfileNotFoundError);
  });

  it('saves custom rate and returns it immediately without querying rate store', async () => {
    const profile = makeProfile();
    const updatedProfile = makeProfile({
      currencyMode: 'custom',
      customRate: 50.25,
      customRateLabel: 'Mi tasa',
    });
    mockProfileRepo.findByDoctorId.mockResolvedValue(profile);
    mockProfileRepo.updateExchangeRate.mockResolvedValue(updatedProfile);

    const result = await useCase.execute(DOCTOR_ID, {
      mode: 'custom',
      customRate: 50.25,
      customRateLabel: 'Mi tasa',
    });

    expect(mockProfileRepo.updateExchangeRate).toHaveBeenCalledWith(DOCTOR_ID, {
      currencyMode: 'custom',
      customRate: 50.25,
      customRateLabel: 'Mi tasa',
    });
    expect(result.mode).toBe('custom');
    expect(result.rate).toBe(50.25);
    expect(mockRateStore.getRate).not.toHaveBeenCalled();
  });

  it('clears custom fields when switching to usd_bcv and returns global rate', async () => {
    const profile = makeProfile({ currencyMode: 'custom', customRate: 50.0 });
    const updatedProfile = makeProfile({ currencyMode: 'usd_bcv', customRate: null });
    mockProfileRepo.findByDoctorId.mockResolvedValue(profile);
    mockProfileRepo.updateExchangeRate.mockResolvedValue(updatedProfile);
    mockRateStore.getRate.mockResolvedValue(36.5);

    const result = await useCase.execute(DOCTOR_ID, {
      mode: 'usd_bcv',
      customRate: null,
      customRateLabel: null,
    });

    expect(mockProfileRepo.updateExchangeRate).toHaveBeenCalledWith(DOCTOR_ID, {
      currencyMode: 'usd_bcv',
      customRate: null,
      customRateLabel: null,
    });
    expect(result.mode).toBe('usd_bcv');
    expect(result.rate).toBe(36.5);
  });
});
