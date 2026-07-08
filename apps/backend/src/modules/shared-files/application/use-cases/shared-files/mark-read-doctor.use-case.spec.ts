import { MarkReadDoctorUseCase } from './mark-read-doctor.use-case';
import { PatientNotUnderDoctorError } from '../../../domain/errors/patient-not-under-doctor.error';
import type { ISharedFileRepository } from '../../../domain/repositories/shared-file.repository';
import type { IPatientRepository } from '../../../../patients/domain/repositories/patient.repository';
import { Patient } from '../../../../patients/domain/entities/patient.entity';

const makePatient = () =>
  Patient.create({
    id: 'patient-001',
    doctorId: 'doctor-001',
    authUserId: null,
    fullName: 'Test',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

describe('MarkReadDoctorUseCase', () => {
  let useCase: MarkReadDoctorUseCase;
  let sharedFileRepo: jest.Mocked<ISharedFileRepository>;
  let patientRepo: jest.Mocked<IPatientRepository>;

  beforeEach(() => {
    sharedFileRepo = {
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

    patientRepo = {
      findById: jest.fn(),
      findByCedulaHash: jest.fn(),
      findByEmailHash: jest.fn(),
      list: jest.fn(),
      findAllByDoctor: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      logReveal: jest.fn(),
    } as jest.Mocked<IPatientRepository>;

    useCase = new MarkReadDoctorUseCase(sharedFileRepo, patientRepo);
  });

  it('marks files as read when patient belongs to doctor', async () => {
    patientRepo.findById.mockResolvedValue(makePatient());
    sharedFileRepo.markReadByDoctor.mockResolvedValue();

    await useCase.execute({ doctorId: 'doctor-001', patientId: 'patient-001' });

    expect(sharedFileRepo.markReadByDoctor).toHaveBeenCalledWith('doctor-001', 'patient-001');
  });

  it('throws PatientNotUnderDoctorError when patient is not under this doctor', async () => {
    patientRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ doctorId: 'doctor-001', patientId: 'patient-999' }),
    ).rejects.toThrow(PatientNotUnderDoctorError);

    expect(sharedFileRepo.markReadByDoctor).not.toHaveBeenCalled();
  });
});
