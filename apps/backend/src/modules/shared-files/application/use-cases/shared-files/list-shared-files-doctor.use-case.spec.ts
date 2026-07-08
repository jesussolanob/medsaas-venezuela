import { ListSharedFilesDoctorUseCase } from './list-shared-files-doctor.use-case';
import { PatientNotUnderDoctorError } from '../../../domain/errors/patient-not-under-doctor.error';
import { SharedFile } from '../../../domain/entities/shared-file.entity';
import type { ISharedFileRepository } from '../../../domain/repositories/shared-file.repository';
import type { IPatientRepository } from '../../../../patients/domain/repositories/patient.repository';
import { Patient } from '../../../../patients/domain/entities/patient.entity';

const makePatient = () =>
  Patient.create({
    id: 'patient-001',
    doctorId: 'doctor-001',
    authUserId: null,
    fullName: 'Test Patient',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

const makeSharedFile = (id: string) =>
  SharedFile.create({
    id,
    doctorId: 'doctor-001',
    patientId: 'patient-001',
    title: 'Item',
    description: null,
    filePath: null,
    fileType: null,
    fileSizeBytes: null,
    category: 'instruction',
    status: 'pending',
    createdBy: 'doctor',
    parentTaskId: null,
    readByDoctor: true,
    readByPatient: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

describe('ListSharedFilesDoctorUseCase', () => {
  let useCase: ListSharedFilesDoctorUseCase;
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

    useCase = new ListSharedFilesDoctorUseCase(sharedFileRepo, patientRepo);
  });

  it('returns list when patient belongs to doctor', async () => {
    patientRepo.findById.mockResolvedValue(makePatient());
    const items = [makeSharedFile('sf-001'), makeSharedFile('sf-002')];
    sharedFileRepo.listByDoctorAndPatient.mockResolvedValue(items);

    const result = await useCase.execute({ doctorId: 'doctor-001', patientId: 'patient-001' });

    expect(result).toBe(items);
    expect(sharedFileRepo.listByDoctorAndPatient).toHaveBeenCalledWith('doctor-001', 'patient-001');
  });

  it('throws PatientNotUnderDoctorError when patient does not belong to doctor', async () => {
    patientRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ doctorId: 'doctor-001', patientId: 'patient-999' }),
    ).rejects.toThrow(PatientNotUnderDoctorError);

    expect(sharedFileRepo.listByDoctorAndPatient).not.toHaveBeenCalled();
  });
});
