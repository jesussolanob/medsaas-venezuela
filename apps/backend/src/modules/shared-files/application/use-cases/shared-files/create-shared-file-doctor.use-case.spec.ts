import { CreateSharedFileDoctorUseCase } from './create-shared-file-doctor.use-case';
import { PatientNotUnderDoctorError } from '../../../domain/errors/patient-not-under-doctor.error';
import { SharedFile } from '../../../domain/entities/shared-file.entity';
import type { ISharedFileRepository } from '../../../domain/repositories/shared-file.repository';
import type { IPatientRepository } from '../../../../patients/domain/repositories/patient.repository';
import { Patient } from '../../../../patients/domain/entities/patient.entity';

const makePatient = (overrides: Partial<ConstructorParameters<typeof Patient>[0]> = {}) =>
  Patient.create({
    id: 'patient-001',
    doctorId: 'doctor-001',
    authUserId: null,
    fullName: 'Juan Pérez',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

const makeSharedFile = (overrides: Partial<ConstructorParameters<typeof SharedFile>[0]> = {}) =>
  SharedFile.create({
    id: 'sf-001',
    doctorId: 'doctor-001',
    patientId: 'patient-001',
    title: 'Tomar pastilla',
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
    ...overrides,
  });

describe('CreateSharedFileDoctorUseCase', () => {
  let useCase: CreateSharedFileDoctorUseCase;
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

    useCase = new CreateSharedFileDoctorUseCase(sharedFileRepo, patientRepo);
  });

  it('creates a shared file successfully when patient belongs to doctor', async () => {
    const patient = makePatient();
    const saved = makeSharedFile();
    patientRepo.findById.mockResolvedValue(patient);
    sharedFileRepo.save.mockResolvedValue(saved);

    const result = await useCase.execute({
      doctorId: 'doctor-001',
      patientId: 'patient-001',
      title: 'Tomar pastilla',
      category: 'instruction',
    });

    expect(result).toBe(saved);
    expect(patientRepo.findById).toHaveBeenCalledWith('patient-001', 'doctor-001');
    expect(sharedFileRepo.save).toHaveBeenCalled();
    const savedArg = sharedFileRepo.save.mock.calls[0]![0]!;
    expect(savedArg.createdBy).toBe('doctor');
    expect(savedArg.readByDoctor).toBe(true);
    expect(savedArg.readByPatient).toBe(false);
    expect(savedArg.status).toBe('pending');
  });

  it('throws PatientNotUnderDoctorError when patient does not belong to doctor', async () => {
    patientRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        doctorId: 'doctor-001',
        patientId: 'patient-999',
        title: 'Test',
        category: 'instruction',
      }),
    ).rejects.toThrow(PatientNotUnderDoctorError);

    expect(sharedFileRepo.save).not.toHaveBeenCalled();
  });

  it('stores filePath, fileType, fileSizeBytes when provided', async () => {
    patientRepo.findById.mockResolvedValue(makePatient());
    sharedFileRepo.save.mockResolvedValue(
      makeSharedFile({ filePath: 'shared/doc.pdf', fileType: 'pdf', fileSizeBytes: 1024 }),
    );

    await useCase.execute({
      doctorId: 'doctor-001',
      patientId: 'patient-001',
      title: 'Lab result',
      category: 'lab_result',
      filePath: 'shared/doc.pdf',
      fileType: 'pdf',
      fileSizeBytes: 1024,
    });

    const savedArg = sharedFileRepo.save.mock.calls[0]![0]!;
    expect(savedArg.filePath).toBe('shared/doc.pdf');
    expect(savedArg.fileType).toBe('pdf');
    expect(savedArg.fileSizeBytes).toBe(1024);
  });

  it('stores parentTaskId when provided', async () => {
    patientRepo.findById.mockResolvedValue(makePatient());
    sharedFileRepo.save.mockResolvedValue(makeSharedFile());

    await useCase.execute({
      doctorId: 'doctor-001',
      patientId: 'patient-001',
      title: 'Reply',
      category: 'comment',
      parentTaskId: 'parent-001',
    });

    const savedArg = sharedFileRepo.save.mock.calls[0]![0]!;
    expect(savedArg.parentTaskId).toBe('parent-001');
  });
});
