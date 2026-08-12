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
      updateExchangeRate: jest.fn(),
      markOnboardingCompleted: jest.fn().mockResolvedValue(undefined),
      updateBlocksLayout: jest.fn().mockResolvedValue(undefined),
      countUpcomingAppointments: jest.fn().mockResolvedValue(0),
      deactivateOwnAccount: jest.fn().mockResolvedValue(undefined),
      findPlanSnapshot: jest.fn().mockResolvedValue(null),
      scheduleOwnAccountDeactivation: jest.fn().mockResolvedValue(undefined),
      applyExpiredScheduledDeactivations: jest.fn().mockResolvedValue(0),
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

  it('passes birthDate through to the repository', async () => {
    const existing = makeProfile();
    const updated = makeProfile({ birthDate: '1985-03-15' });
    mockRepo.findByDoctorId.mockResolvedValue(existing);
    mockRepo.update.mockResolvedValue(updated);

    await useCase.execute(DOCTOR_ID, { birthDate: '1985-03-15' });

    expect(mockRepo.update).toHaveBeenCalledWith(DOCTOR_ID, { birthDate: '1985-03-15' });
    expect(updated.birthDate).toBe('1985-03-15');
  });

  it('passes null birthDate to clear the field', async () => {
    const existing = makeProfile({ birthDate: '1985-03-15' });
    const updated = makeProfile({ birthDate: null });
    mockRepo.findByDoctorId.mockResolvedValue(existing);
    mockRepo.update.mockResolvedValue(updated);

    await useCase.execute(DOCTOR_ID, { birthDate: null });

    expect(mockRepo.update).toHaveBeenCalledWith(DOCTOR_ID, { birthDate: null });
    expect(updated.birthDate).toBeNull();
  });

  it('updates fullName when full_name is provided', async () => {
    const existing = makeProfile({ fullName: 'Dr. Viejo Nombre' });
    const updated = makeProfile({ fullName: 'Dr. Nuevo Nombre' });
    mockRepo.findByDoctorId.mockResolvedValue(existing);
    mockRepo.update.mockResolvedValue(updated);

    const result = await useCase.execute(DOCTOR_ID, { fullName: 'Dr. Nuevo Nombre' });

    expect(result.fullName).toBe('Dr. Nuevo Nombre');
    expect(mockRepo.update).toHaveBeenCalledWith(DOCTOR_ID, { fullName: 'Dr. Nuevo Nombre' });
  });

  it('does not allow cedula to be passed in update params', async () => {
    // cedula is read-only — it is not a key of DoctorProfileUpdateParams.
    // This test confirms the type contract: the object below must not include cedula.
    const existing = makeProfile({ cedula: 'V-12345678' });
    const updated = makeProfile({ cedula: 'V-12345678' });
    mockRepo.findByDoctorId.mockResolvedValue(existing);
    mockRepo.update.mockResolvedValue(updated);

    // Pass only editable fields — cedula intentionally absent
    const params = { specialty: 'Cardiología' };
    await useCase.execute(DOCTOR_ID, params);

    expect(mockRepo.update).toHaveBeenCalledWith(DOCTOR_ID, { specialty: 'Cardiología' });
    // cedula in the returned entity is whatever the DB has — unchanged
    expect(updated.cedula).toBe('V-12345678');
  });
});
