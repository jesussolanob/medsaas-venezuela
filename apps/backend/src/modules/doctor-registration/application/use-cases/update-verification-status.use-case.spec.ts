import { UpdateVerificationStatusUseCase } from './update-verification-status.use-case';
import type { IDoctorRegistrationRepository } from '../../domain/repositories/doctor-registration.repository';
import { DoctorRegistration } from '../../domain/entities/doctor-registration.entity';
import { DoctorRegistrationNotFoundError } from '../../domain/errors/doctor-not-found.error';

const makePendingRegistration = (): DoctorRegistration =>
  DoctorRegistration.create({
    id: 'doc-1',
    fullName: 'Carlos M.',
    email: 'carlos@example.com',
    cedula: 'V-12345678',
    mppsNumber: 'MP-001',
    colegiadoNumber: null,
    specialty: null,
    verificationStatus: 'pending',
    verifiedAt: null,
    verifiedBy: null,
    createdAt: new Date(),
  });

describe('UpdateVerificationStatusUseCase', () => {
  let useCase: UpdateVerificationStatusUseCase;
  let mockRepo: jest.Mocked<IDoctorRegistrationRepository>;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      updateRegistration: jest.fn(),
      updateVerification: jest.fn(),
      listByVerificationStatus: jest.fn(),
      findAllSuperAdmins: jest.fn(),
    } as unknown as jest.Mocked<IDoctorRegistrationRepository>;

    useCase = new UpdateVerificationStatusUseCase(mockRepo);
  });

  it('verifies a pending doctor successfully', async () => {
    const pending = makePendingRegistration();
    const verifiedAt = new Date('2026-06-11T10:00:00Z');
    const verified = pending.withVerification('verified', 'admin-99', verifiedAt);

    mockRepo.findById.mockResolvedValue(pending);
    mockRepo.updateVerification.mockResolvedValue(verified);

    const result = await useCase.execute({
      doctorId: 'doc-1',
      status: 'verified',
      actorId: 'admin-99',
    });

    expect(mockRepo.updateVerification).toHaveBeenCalledWith('doc-1', {
      status: 'verified',
      verifiedBy: 'admin-99',
      verifiedAt: expect.any(Date),
    });
    expect(result.verificationStatus).toBe('verified');
    expect(result.verifiedBy).toBe('admin-99');
  });

  it('rejects a pending doctor successfully', async () => {
    const pending = makePendingRegistration();
    const rejectedAt = new Date('2026-06-11T11:00:00Z');
    const rejected = pending.withVerification('rejected', 'admin-1', rejectedAt);

    mockRepo.findById.mockResolvedValue(pending);
    mockRepo.updateVerification.mockResolvedValue(rejected);

    const result = await useCase.execute({
      doctorId: 'doc-1',
      status: 'rejected',
      actorId: 'admin-1',
    });

    expect(result.verificationStatus).toBe('rejected');
  });

  it('throws DoctorRegistrationNotFoundError when doctor does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ doctorId: 'nonexistent', status: 'verified', actorId: 'admin-1' }),
    ).rejects.toThrow(DoctorRegistrationNotFoundError);
  });

  it('propagates repo errors during updateVerification', async () => {
    const pending = makePendingRegistration();
    mockRepo.findById.mockResolvedValue(pending);
    mockRepo.updateVerification.mockRejectedValue(new Error('DB write failed'));

    await expect(
      useCase.execute({ doctorId: 'doc-1', status: 'verified', actorId: 'admin-1' }),
    ).rejects.toThrow('DB write failed');
  });
});
