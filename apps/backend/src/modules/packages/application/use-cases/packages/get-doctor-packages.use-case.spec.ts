import { GetDoctorPackagesUseCase, type GetDoctorPackagesInput } from './get-doctor-packages.use-case';
import { PatientPackage } from '../../../domain/entities/patient-package.entity';
import type { IPackageRepository } from '../../../domain/repositories/package.repository';

const DOCTOR_ID = 'doctor-uuid-1';
const PATIENT_ID = 'patient-uuid-1';
const NOW = new Date('2026-06-05T10:00:00Z');

function makePackage(overrides: Record<string, unknown> = {}): PatientPackage {
  return PatientPackage.create({
    id: 'pkg-uuid-1',
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    planName: 'Plan Básico',
    totalSessions: 10,
    usedSessions: 3,
    status: 'active',
    purchasedAmountUsd: 100,
    notifiedOneLeft: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

describe('GetDoctorPackagesUseCase', () => {
  let useCase: GetDoctorPackagesUseCase;
  let mockRepo: jest.Mocked<IPackageRepository>;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findByPatientId: jest.fn(),
      findActiveByEmailHash: jest.fn(),
      save: jest.fn(),
      consumeSessionOptimistic: jest.fn(),
      listByDoctor: jest.fn(),
    } as unknown as jest.Mocked<IPackageRepository>;

    useCase = new GetDoctorPackagesUseCase(mockRepo);
  });

  it('calls listByDoctor with doctorId scoped to authenticated user', async () => {
    const pkgs = [makePackage()];
    mockRepo.listByDoctor.mockResolvedValue(pkgs);

    const input: GetDoctorPackagesInput = { doctorId: DOCTOR_ID };
    const result = await useCase.execute(input);

    expect(result).toEqual(pkgs);
    expect(mockRepo.listByDoctor).toHaveBeenCalledWith({
      doctorId: DOCTOR_ID,
      patientId: undefined,
      status: undefined,
    });
  });

  it('passes optional patientId filter through to the repo', async () => {
    mockRepo.listByDoctor.mockResolvedValue([]);

    await useCase.execute({ doctorId: DOCTOR_ID, patientId: PATIENT_ID });

    expect(mockRepo.listByDoctor).toHaveBeenCalledWith({
      doctorId: DOCTOR_ID,
      patientId: PATIENT_ID,
      status: undefined,
    });
  });

  it('passes optional status filter through to the repo', async () => {
    mockRepo.listByDoctor.mockResolvedValue([]);

    await useCase.execute({ doctorId: DOCTOR_ID, status: 'active' });

    expect(mockRepo.listByDoctor).toHaveBeenCalledWith({
      doctorId: DOCTOR_ID,
      patientId: undefined,
      status: 'active',
    });
  });

  it('returns empty array when doctor has no packages', async () => {
    mockRepo.listByDoctor.mockResolvedValue([]);

    const result = await useCase.execute({ doctorId: DOCTOR_ID });

    expect(result).toEqual([]);
  });

  it('converts null patientId to undefined (no filter)', async () => {
    mockRepo.listByDoctor.mockResolvedValue([]);

    await useCase.execute({ doctorId: DOCTOR_ID, patientId: null });

    expect(mockRepo.listByDoctor).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: undefined }),
    );
  });

  it('converts null status to undefined (no filter)', async () => {
    mockRepo.listByDoctor.mockResolvedValue([]);

    await useCase.execute({ doctorId: DOCTOR_ID, status: null });

    expect(mockRepo.listByDoctor).toHaveBeenCalledWith(
      expect.objectContaining({ status: undefined }),
    );
  });
});
