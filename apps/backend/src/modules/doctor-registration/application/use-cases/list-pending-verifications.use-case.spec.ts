import { ListPendingVerificationsUseCase } from './list-pending-verifications.use-case';
import type { IDoctorRegistrationRepository } from '../../domain/repositories/doctor-registration.repository';
import { DoctorRegistration } from '../../domain/entities/doctor-registration.entity';

describe('ListPendingVerificationsUseCase', () => {
  let useCase: ListPendingVerificationsUseCase;
  let mockRepo: jest.Mocked<IDoctorRegistrationRepository>;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      updateRegistration: jest.fn(),
      updateVerification: jest.fn(),
      listByVerificationStatus: jest.fn(),
      findAllSuperAdmins: jest.fn(),
    } as unknown as jest.Mocked<IDoctorRegistrationRepository>;

    useCase = new ListPendingVerificationsUseCase(mockRepo);
  });

  it('delegates to repo with given status', async () => {
    const registration = DoctorRegistration.create({
      id: 'doc-1',
      fullName: 'Dr. Test',
      email: 'dr@example.com',
      cedula: 'V-1',
      mppsNumber: null,
      colegiadoNumber: null,
      verificationStatus: 'pending',
      verifiedAt: null,
      verifiedBy: null,
      createdAt: new Date(),
    });
    mockRepo.listByVerificationStatus.mockResolvedValue([registration]);

    const results = await useCase.execute({ status: 'pending', limit: 50, offset: 0 });

    expect(mockRepo.listByVerificationStatus).toHaveBeenCalledWith('pending', {
      limit: 50,
      offset: 0,
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('doc-1');
  });

  it('returns empty array when no doctors match status', async () => {
    mockRepo.listByVerificationStatus.mockResolvedValue([]);

    const results = await useCase.execute({ status: 'verified', limit: 50, offset: 0 });

    expect(results).toHaveLength(0);
  });

  it('passes custom pagination to repo', async () => {
    mockRepo.listByVerificationStatus.mockResolvedValue([]);

    await useCase.execute({ status: 'pending', limit: 10, offset: 20 });

    expect(mockRepo.listByVerificationStatus).toHaveBeenCalledWith('pending', {
      limit: 10,
      offset: 20,
    });
  });

  it('propagates repo errors', async () => {
    mockRepo.listByVerificationStatus.mockRejectedValue(new Error('DB error'));

    await expect(useCase.execute({ status: 'pending', limit: 50, offset: 0 })).rejects.toThrow(
      'DB error',
    );
  });
});
