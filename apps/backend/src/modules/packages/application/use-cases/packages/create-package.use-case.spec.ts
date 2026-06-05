import { CreatePackageUseCase } from './create-package.use-case';
import type { IPackageRepository } from '../../../domain/repositories/package.repository';
import { PatientPackage } from '../../../domain/entities/patient-package.entity';

const makeDto = () => ({
  patient_id: 'pat-001',
  plan_name: 'Paquete 10 sesiones',
  total_sessions: 10,
  purchased_amount_usd: 150,
  specialty: 'Cardiología',
});

describe('CreatePackageUseCase', () => {
  let useCase: CreatePackageUseCase;
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
    useCase = new CreatePackageUseCase(mockRepo);
  });

  it('creates a package with correct attributes', async () => {
    const saved = PatientPackage.create({
      id: 'pkg-new',
      doctorId: 'doc-001',
      patientId: 'pat-001',
      planName: 'Paquete 10 sesiones',
      totalSessions: 10,
      usedSessions: 0,
      status: 'active',
      purchasedAmountUsd: 150,
      specialty: 'Cardiología',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockRepo.save.mockResolvedValue(saved);

    const result = await useCase.execute(makeDto(), 'doc-001');

    expect(mockRepo.save).toHaveBeenCalledTimes(1);
    expect(mockRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        doctorId: 'doc-001',
        patientId: 'pat-001',
        planName: 'Paquete 10 sesiones',
        totalSessions: 10,
        usedSessions: 0,
        status: 'active',
      }),
    );
    expect(result.id).toBe('pkg-new');
  });

  it('generates a unique ID for each package', async () => {
    mockRepo.save.mockImplementation((pkg) => Promise.resolve(pkg));
    const r1 = await useCase.execute(makeDto(), 'doc-001');
    const r2 = await useCase.execute(makeDto(), 'doc-001');
    expect(r1.id).not.toBe(r2.id);
  });
});
