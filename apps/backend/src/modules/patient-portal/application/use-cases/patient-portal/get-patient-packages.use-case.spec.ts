import { GetPatientPackagesUseCase } from './get-patient-packages.use-case';
import type { IPatientPortalRepository } from '../../../domain/repositories/patient-portal.repository';
import type { PackageSummary } from '../../../domain/entities/patient-dashboard.entity';

function makePkg(id: string, status: 'active' | 'completed' = 'active'): PackageSummary {
  return {
    id,
    planName: 'Plan Test',
    totalSessions: 5,
    usedSessions: 2,
    remainingSessions: 3,
    status,
    doctorId: 'doctor-1',
    doctorName: 'Dr. García',
    bookingLink: '/book/token-abc',
  };
}

describe('GetPatientPackagesUseCase', () => {
  let useCase: GetPatientPackagesUseCase;
  let mockRepo: jest.Mocked<IPatientPortalRepository>;

  beforeEach(() => {
    mockRepo = {
      findPatientIdsByAuthUserId: jest.fn(),
      findPatientsByAuthUserId: jest.fn(),
      findPatientByIdAndAuthUserId: jest.fn(),
      updatePatient: jest.fn(),
      findNextAppointment: jest.fn(),
      countAppointments: jest.fn(),
      listAppointments: jest.fn(),
      findActivePackages: jest.fn(),
      listPackages: jest.fn(),
      listPrescriptions: jest.fn(),
      listMessages: jest.fn(),
      insertMessage: jest.fn(),
      findPatientIdForDoctorRelationship: jest.fn(),
    } as jest.Mocked<IPatientPortalRepository>;

    useCase = new GetPatientPackagesUseCase(mockRepo);
  });

  it('includes doctor name and booking link', async () => {
    const pkg = makePkg('pkg-1');
    mockRepo.listPackages.mockResolvedValue([pkg]);

    const result = await useCase.execute({ authUserId: 'patient-auth-1' });

    const first = result[0];
    expect(first).toBeDefined();
    expect(first!.doctorName).toBe('Dr. García');
    expect(first!.bookingLink).toBe('/book/token-abc');
  });

  it('only returns active packages when onlyActive is true', async () => {
    const activeOnly = [makePkg('pkg-1', 'active')];
    mockRepo.findActivePackages.mockResolvedValue(activeOnly);

    const result = await useCase.execute({ authUserId: 'patient-auth-1', onlyActive: true });

    expect(mockRepo.findActivePackages).toHaveBeenCalledWith('patient-auth-1');
    expect(mockRepo.listPackages).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe('active');
  });

  it('returns all packages when onlyActive is not set', async () => {
    const all = [makePkg('pkg-1', 'active'), makePkg('pkg-2', 'completed')];
    mockRepo.listPackages.mockResolvedValue(all);

    const result = await useCase.execute({ authUserId: 'patient-auth-1' });

    expect(mockRepo.listPackages).toHaveBeenCalledWith('patient-auth-1');
    expect(mockRepo.findActivePackages).not.toHaveBeenCalled();
    expect(result).toHaveLength(2);
  });
});
