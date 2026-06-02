import { UpdateDoctorProfileUseCase } from './update-doctor-profile.use-case';
import { DoctorProfileNotFoundError } from '../../../domain/errors/doctor-profile-not-found.error';
import type { IDoctorProfileRepository } from '../../../domain/repositories/doctor-profile.repository';
import { DoctorProfile } from '../../../domain/entities/doctor-profile.entity';

const DOCTOR_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeProfile(
  overrides: Partial<ConstructorParameters<typeof DoctorProfile>[0]> = {},
): DoctorProfile {
  return DoctorProfile.create({
    id: DOCTOR_ID,
    fullName: 'Dr. Test',
    email: 'test@example.com',
    specialty: 'General',
    professionalTitle: 'Dr.',
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
    ...overrides,
  });
}

describe('UpdateDoctorProfileUseCase', () => {
  let useCase: UpdateDoctorProfileUseCase;
  let mockRepo: jest.Mocked<IDoctorProfileRepository>;

  beforeEach(() => {
    mockRepo = {
      findByDoctorId: jest.fn(),
      update: jest.fn(),
    };
    useCase = new UpdateDoctorProfileUseCase(mockRepo);
  });

  it('updates the profile when it exists', async () => {
    const existing = makeProfile();
    const updated = makeProfile({ specialty: 'Cardiología', allowsOnline: true });
    mockRepo.findByDoctorId.mockResolvedValue(existing);
    mockRepo.update.mockResolvedValue(updated);

    const params = { specialty: 'Cardiología', allowsOnline: true };
    const result = await useCase.execute(DOCTOR_ID, params);

    expect(result.specialty).toBe('Cardiología');
    expect(result.allowsOnline).toBe(true);
    expect(mockRepo.update).toHaveBeenCalledWith(DOCTOR_ID, params);
  });

  it('throws DoctorProfileNotFoundError when profile does not exist', async () => {
    mockRepo.findByDoctorId.mockResolvedValue(null);

    await expect(useCase.execute(DOCTOR_ID, {})).rejects.toBeInstanceOf(DoctorProfileNotFoundError);
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it('passes payment_details through to the repository', async () => {
    const existing = makeProfile();
    const updated = makeProfile({ paymentDetails: { zelle: 'doc@zelle.com' } });
    mockRepo.findByDoctorId.mockResolvedValue(existing);
    mockRepo.update.mockResolvedValue(updated);

    await useCase.execute(DOCTOR_ID, { paymentDetails: { zelle: 'doc@zelle.com' } });

    expect(mockRepo.update).toHaveBeenCalledWith(DOCTOR_ID, {
      paymentDetails: { zelle: 'doc@zelle.com' },
    });
  });
});
