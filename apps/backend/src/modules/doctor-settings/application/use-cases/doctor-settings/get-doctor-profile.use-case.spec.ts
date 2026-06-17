import { GetDoctorProfileUseCase } from './get-doctor-profile.use-case';
import { DoctorProfileNotFoundError } from '../../../domain/errors/doctor-profile-not-found.error';
import type { IDoctorProfileRepository } from '../../../domain/repositories/doctor-profile.repository';
import { DoctorProfile } from '../../../domain/entities/doctor-profile.entity';

const DOCTOR_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeProfile(): DoctorProfile {
  return DoctorProfile.create({
    id: DOCTOR_ID,
    fullName: 'Dr. Test',
    email: 'test@example.com',
    specialty: 'General',
    professionalTitle: 'Dr.',
    clinicId: null,
    clinicRole: null,
    paymentMethods: ['zelle'],
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
    cedula: 'V-12345678',
    birthDate: '1985-03-15',
    onboardingCompleted: true,
  });
}

describe('GetDoctorProfileUseCase', () => {
  let useCase: GetDoctorProfileUseCase;
  let mockRepo: jest.Mocked<IDoctorProfileRepository>;

  beforeEach(() => {
    mockRepo = {
      findByDoctorId: jest.fn(),
      update: jest.fn(),
      updateExchangeRate: jest.fn(),
    };
    useCase = new GetDoctorProfileUseCase(mockRepo);
  });

  it('returns the profile when found', async () => {
    const profile = makeProfile();
    mockRepo.findByDoctorId.mockResolvedValue(profile);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result).toBe(profile);
    expect(mockRepo.findByDoctorId).toHaveBeenCalledWith(DOCTOR_ID);
  });

  it('throws DoctorProfileNotFoundError when profile is null', async () => {
    mockRepo.findByDoctorId.mockResolvedValue(null);

    await expect(useCase.execute(DOCTOR_ID)).rejects.toBeInstanceOf(DoctorProfileNotFoundError);
  });

  it('includes cedula and birthDate in the returned profile', async () => {
    const profile = makeProfile();
    mockRepo.findByDoctorId.mockResolvedValue(profile);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.cedula).toBe('V-12345678');
    expect(result.birthDate).toBe('1985-03-15');
  });

  it('includes onboardingCompleted in the returned profile', async () => {
    const profile = makeProfile();
    mockRepo.findByDoctorId.mockResolvedValue(profile);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.onboardingCompleted).toBe(true);
  });
});
