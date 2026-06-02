import { GetPatientPackagesUseCase } from './get-patient-packages.use-case';
import { PatientPackage } from '../../../domain/entities/patient-package.entity';
import type { IPackageRepository } from '../../../domain/repositories/package.repository';

const makePkg = (id: string) =>
  PatientPackage.create({
    id,
    doctorId: 'doc-001',
    patientId: 'pat-001',
    planName: 'Paquete',
    totalSessions: 10,
    usedSessions: 0,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

describe('GetPatientPackagesUseCase', () => {
  let useCase: GetPatientPackagesUseCase;
  let mockRepo: jest.Mocked<IPackageRepository>;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findByPatientId: jest.fn(),
      findActiveByEmailHash: jest.fn(),
      save: jest.fn(),
      consumeSessionOptimistic: jest.fn(),
    };
    useCase = new GetPatientPackagesUseCase(mockRepo);
  });

  it('returns all packages for the patient scoped to the doctor', async () => {
    const pkgs = [makePkg('pkg-1'), makePkg('pkg-2')];
    mockRepo.findByPatientId.mockResolvedValue(pkgs);

    const result = await useCase.execute({ patientId: 'pat-001', doctorId: 'doc-001' });

    expect(result).toHaveLength(2);
    expect(mockRepo.findByPatientId).toHaveBeenCalledWith('pat-001', 'doc-001');
  });

  it('returns empty array when patient has no packages', async () => {
    mockRepo.findByPatientId.mockResolvedValue([]);
    const result = await useCase.execute({ patientId: 'pat-002', doctorId: 'doc-001' });
    expect(result).toHaveLength(0);
  });
});
