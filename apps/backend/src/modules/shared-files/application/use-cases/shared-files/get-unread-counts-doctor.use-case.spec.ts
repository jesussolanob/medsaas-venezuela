import { GetUnreadCountsDoctorUseCase } from './get-unread-counts-doctor.use-case';
import type { ISharedFileRepository } from '../../../domain/repositories/shared-file.repository';

describe('GetUnreadCountsDoctorUseCase', () => {
  let useCase: GetUnreadCountsDoctorUseCase;
  let repo: jest.Mocked<ISharedFileRepository>;

  beforeEach(() => {
    repo = {
      save: jest.fn(),
      findByIdAndDoctor: jest.fn(),
      findByIdAndPatient: jest.fn(),
      listByDoctorAndPatient: jest.fn(),
      listByPatient: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      markReadByDoctor: jest.fn(),
      markReadByPatient: jest.fn(),
      getUnreadCountsByDoctor: jest.fn(),
    } as jest.Mocked<ISharedFileRepository>;

    useCase = new GetUnreadCountsDoctorUseCase(repo);
  });

  it('returns unread counts keyed by patientId', async () => {
    const counts = { 'patient-001': 3, 'patient-002': 0 };
    repo.getUnreadCountsByDoctor.mockResolvedValue(counts);

    const result = await useCase.execute({ doctorId: 'doctor-001' });

    expect(result).toEqual(counts);
    expect(repo.getUnreadCountsByDoctor).toHaveBeenCalledWith('doctor-001');
  });

  it('returns empty object when no unread items', async () => {
    repo.getUnreadCountsByDoctor.mockResolvedValue({});
    const result = await useCase.execute({ doctorId: 'doctor-001' });
    expect(result).toEqual({});
  });
});
