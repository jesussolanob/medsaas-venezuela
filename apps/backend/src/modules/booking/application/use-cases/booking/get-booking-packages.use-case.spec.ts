import { GetBookingPackagesUseCase, InvalidEmailError } from './get-booking-packages.use-case';
import { PatientPackage } from '../../../../packages/domain/entities/patient-package.entity';
import type { IPackageRepository } from '../../../../packages/domain/repositories/package.repository';

const makePkg = () =>
  PatientPackage.create({
    id: 'pkg-001',
    doctorId: 'doc-001',
    patientId: 'pat-001',
    planName: 'Paquete 10',
    totalSessions: 10,
    usedSessions: 3,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

const mockCrypto = { hashForSearch: jest.fn().mockReturnValue('hash-abc') };

describe('GetBookingPackagesUseCase', () => {
  let useCase: GetBookingPackagesUseCase;
  let mockRepo: jest.Mocked<IPackageRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo = {
      findById: jest.fn(),
      findByPatientId: jest.fn(),
      findActiveByEmailHash: jest.fn(),
      save: jest.fn(),
      consumeSessionOptimistic: jest.fn(),
      listByDoctor: jest.fn(),
    };
    useCase = new GetBookingPackagesUseCase(
      mockRepo,
      mockCrypto as unknown as import('../../../../../infrastructure/crypto/crypto.service').CryptoService,
    );
  });

  it('returns safe package summaries for a valid email', async () => {
    mockRepo.findActiveByEmailHash.mockResolvedValue([makePkg()]);
    const result = await useCase.execute('doc-001', 'patient@example.com');
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('remainingSessions', 7);
    // Must not expose patient_id
    expect(result[0]).not.toHaveProperty('patientId');
    expect(mockCrypto.hashForSearch).toHaveBeenCalledWith('patient@example.com');
    expect(mockRepo.findActiveByEmailHash).toHaveBeenCalledWith('hash-abc', 'doc-001');
  });

  it('throws InvalidEmailError (400) for a malformed email', async () => {
    await expect(useCase.execute('doc-001', 'not-an-email')).rejects.toThrow(InvalidEmailError);
    expect(mockRepo.findActiveByEmailHash).not.toHaveBeenCalled();
  });

  it('InvalidEmailError carries httpStatus 400', async () => {
    try {
      await useCase.execute('doc-001', 'bad@@email');
    } catch (err) {
      expect((err as InvalidEmailError).httpStatus).toBe(400);
    }
  });

  it('returns empty array when patient has no active packages', async () => {
    mockRepo.findActiveByEmailHash.mockResolvedValue([]);
    const result = await useCase.execute('doc-001', 'new@patient.com');
    expect(result).toHaveLength(0);
  });
});
