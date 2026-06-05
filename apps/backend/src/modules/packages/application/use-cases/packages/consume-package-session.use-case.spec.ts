import { ConsumePackageSessionUseCase } from './consume-package-session.use-case';
import { PatientPackage } from '../../../domain/entities/patient-package.entity';
import { PackageNotFoundError } from '../../../domain/errors/package-not-found.error';
import { PackageNotOwnedError } from '../../../domain/errors/package-not-owned.error';
import { PackageExhaustedError } from '../../../domain/errors/package-exhausted.error';
import { PackageInsufficientSessionsError } from '../../../domain/errors/package-insufficient-sessions.error';
import type { IPackageRepository } from '../../../domain/repositories/package.repository';

const makePkg = (overrides: Partial<Parameters<typeof PatientPackage.create>[0]> = {}) =>
  PatientPackage.create({
    id: 'pkg-001',
    doctorId: 'doc-001',
    patientId: 'pat-001',
    planName: 'Paquete 10',
    totalSessions: 10,
    usedSessions: 5,
    status: 'active',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });

describe('ConsumePackageSessionUseCase', () => {
  let useCase: ConsumePackageSessionUseCase;
  let mockRepo: jest.Mocked<IPackageRepository>;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findByPatientId: jest.fn(),
      findActiveByEmailHash: jest.fn(),
      save: jest.fn(),
      consumeSessionOptimistic: jest.fn(),
      listByDoctor: jest.fn(),
    };
    useCase = new ConsumePackageSessionUseCase(mockRepo);
  });

  it('decrements remaining sessions on success', async () => {
    const pkg = makePkg({ usedSessions: 5 });
    const updated = makePkg({ usedSessions: 6 });
    mockRepo.findById
      .mockResolvedValueOnce(pkg) // initial load
      .mockResolvedValueOnce(pkg) // pre-lock read
      .mockResolvedValueOnce(updated); // post-lock re-fetch
    mockRepo.consumeSessionOptimistic.mockResolvedValue(true);

    const result = await useCase.execute({ packageId: 'pkg-001', doctorId: 'doc-001' });

    expect(result.usedSessions).toBe(6);
    // transaction is undefined when called without one (standalone, not inside booking)
    expect(mockRepo.consumeSessionOptimistic).toHaveBeenCalledWith('pkg-001', 5, undefined);
  });

  it('marks package as completed when last session consumed', async () => {
    const pkg = makePkg({ usedSessions: 9 });
    const completed = makePkg({ usedSessions: 10, status: 'completed' });
    mockRepo.findById
      .mockResolvedValueOnce(pkg)
      .mockResolvedValueOnce(pkg)
      .mockResolvedValueOnce(completed);
    mockRepo.consumeSessionOptimistic.mockResolvedValue(true);

    const result = await useCase.execute({ packageId: 'pkg-001', doctorId: 'doc-001' });

    expect(result.status).toBe('completed');
    expect(result.usedSessions).toBe(10);
  });

  it('retries on concurrent modification and eventually succeeds', async () => {
    const pkg = makePkg({ usedSessions: 5 });
    const updated = makePkg({ usedSessions: 6 });

    // First call is the initial ownership check, then repeated reads during retry loop
    mockRepo.findById
      .mockResolvedValueOnce(pkg) // initial load
      .mockResolvedValueOnce(pkg) // first loop read
      .mockResolvedValueOnce(pkg) // second loop read (after first retry)
      .mockResolvedValueOnce(updated); // post-lock re-fetch
    // First attempt fails (concurrency), second succeeds
    mockRepo.consumeSessionOptimistic.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const result = await useCase.execute({ packageId: 'pkg-001', doctorId: 'doc-001' });

    expect(result.usedSessions).toBe(6);
    expect(mockRepo.consumeSessionOptimistic).toHaveBeenCalledTimes(2);
  });

  it('throws PackageInsufficientSessionsError after max retries exhausted', async () => {
    const pkg = makePkg({ usedSessions: 5 });

    // The initial load + the reads within the retry loop (MAX_RETRIES = 3 means 3 loop iterations)
    mockRepo.findById.mockResolvedValue(pkg);
    mockRepo.consumeSessionOptimistic.mockResolvedValue(false);

    await expect(useCase.execute({ packageId: 'pkg-001', doctorId: 'doc-001' })).rejects.toThrow(
      PackageInsufficientSessionsError,
    );
  });

  it('throws PackageNotFoundError when package does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute({ packageId: 'pkg-999', doctorId: 'doc-001' })).rejects.toThrow(
      PackageNotFoundError,
    );
  });

  it('throws PackageNotOwnedError when doctor does not own the package', async () => {
    const pkg = makePkg({ doctorId: 'doc-other' });
    mockRepo.findById.mockResolvedValue(pkg);

    await expect(useCase.execute({ packageId: 'pkg-001', doctorId: 'doc-001' })).rejects.toThrow(
      PackageNotOwnedError,
    );
  });

  it('throws PackageExhaustedError when package is already completed', async () => {
    const pkg = makePkg({ usedSessions: 10, status: 'completed' });
    mockRepo.findById.mockResolvedValue(pkg);

    await expect(useCase.execute({ packageId: 'pkg-001', doctorId: 'doc-001' })).rejects.toThrow(
      PackageExhaustedError,
    );
  });
});
