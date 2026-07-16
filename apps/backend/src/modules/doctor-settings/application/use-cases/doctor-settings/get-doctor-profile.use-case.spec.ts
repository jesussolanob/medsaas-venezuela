import { GetDoctorProfileUseCase } from './get-doctor-profile.use-case';
import { DoctorProfileNotFoundError } from '../../../domain/errors/doctor-profile-not-found.error';
import type { IDoctorProfileRepository } from '../../../domain/repositories/doctor-profile.repository';
import type { IStoragePort } from '../../../../storage/application/ports/storage.port';
import { DoctorProfile } from '../../../domain/entities/doctor-profile.entity';

const DOCTOR_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const GCS_URL =
  'https://storage.googleapis.com/my-bucket/avatar/doc.png?X-Goog-Algorithm=GOOG4-RSA-SHA256';
const FRESH_URL =
  'https://storage.googleapis.com/my-bucket/avatar/doc.png?X-Goog-Algorithm=GOOG4-RSA-SHA256&refreshed=1';

function makeProfile(
  overrides: {
    avatarUrl?: string | null;
    logoUrl?: string | null;
    signatureUrl?: string | null;
  } = {},
): DoctorProfile {
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
    avatarUrl: overrides.avatarUrl ?? null,
    plan: 'basic',
    subscriptionStatus: 'active',
    logoUrl: overrides.logoUrl ?? null,
    signatureUrl: overrides.signatureUrl ?? null,
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

function makeMockStoragePort(): jest.Mocked<IStoragePort> {
  return {
    upload: jest.fn(),
    getSignedUrl: jest.fn().mockResolvedValue(FRESH_URL),
  };
}

describe('GetDoctorProfileUseCase', () => {
  let useCase: GetDoctorProfileUseCase;
  let mockRepo: jest.Mocked<IDoctorProfileRepository>;
  let mockStorage: jest.Mocked<IStoragePort>;

  beforeEach(() => {
    mockRepo = {
      findByDoctorId: jest.fn(),
      update: jest.fn(),
      updateExchangeRate: jest.fn(),
    };
    mockStorage = makeMockStoragePort();
    useCase = new GetDoctorProfileUseCase(mockRepo, mockStorage);
  });

  it('returns the profile when found and all image URLs are null', async () => {
    const profile = makeProfile();
    mockRepo.findByDoctorId.mockResolvedValue(profile);

    const result = await useCase.execute(DOCTOR_ID);

    // null URLs are not GCS — same profile object returned
    expect(result).toBe(profile);
    expect(mockRepo.findByDoctorId).toHaveBeenCalledWith(DOCTOR_ID);
    expect(mockStorage.getSignedUrl).not.toHaveBeenCalled();
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

  it('re-signs GCS avatar URL at read time and returns fresh URL', async () => {
    const profile = makeProfile({ avatarUrl: GCS_URL });
    mockRepo.findByDoctorId.mockResolvedValue(profile);
    mockStorage.getSignedUrl.mockResolvedValue(FRESH_URL);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.avatarUrl).toBe(FRESH_URL);
    expect(mockStorage.getSignedUrl).toHaveBeenCalledWith('avatar/doc.png', expect.any(Number));
  });

  it('re-signs GCS logo URL at read time', async () => {
    const profile = makeProfile({ logoUrl: GCS_URL });
    mockRepo.findByDoctorId.mockResolvedValue(profile);
    mockStorage.getSignedUrl.mockResolvedValue(FRESH_URL);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.logoUrl).toBe(FRESH_URL);
  });

  it('re-signs GCS signature URL at read time', async () => {
    const profile = makeProfile({ signatureUrl: GCS_URL });
    mockRepo.findByDoctorId.mockResolvedValue(profile);
    mockStorage.getSignedUrl.mockResolvedValue(FRESH_URL);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.signatureUrl).toBe(FRESH_URL);
  });

  it('does not re-sign non-GCS URLs (returns them unchanged)', async () => {
    const nonGcsUrl = 'https://cdn.example.com/avatar.png';
    const profile = makeProfile({ avatarUrl: nonGcsUrl });
    mockRepo.findByDoctorId.mockResolvedValue(profile);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.avatarUrl).toBe(nonGcsUrl);
    expect(mockStorage.getSignedUrl).not.toHaveBeenCalled();
    // Same object returned since nothing changed
    expect(result).toBe(profile);
  });
});
