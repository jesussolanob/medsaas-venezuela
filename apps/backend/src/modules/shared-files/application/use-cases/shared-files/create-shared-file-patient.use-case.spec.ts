import { CreateSharedFilePatientUseCase } from './create-shared-file-patient.use-case';
import { SharedFileNotFoundError } from '../../../domain/errors/shared-file-not-found.error';
import { SharedFile } from '../../../domain/entities/shared-file.entity';
import { Patient } from '../../../../patients/domain/entities/patient.entity';
import type { ISharedFileRepository } from '../../../domain/repositories/shared-file.repository';
import type { IPatientPortalRepository } from '../../../../patient-portal/domain/repositories/patient-portal.repository';

const makePatient = () =>
  Patient.create({
    id: 'patient-001',
    doctorId: 'doctor-001',
    authUserId: 'auth-001',
    fullName: 'Test Patient',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

const makeSF = () =>
  SharedFile.create({
    id: 'sf-001',
    doctorId: 'doctor-001',
    patientId: 'patient-001',
    title: 'Response',
    description: null,
    filePath: null,
    fileType: null,
    fileSizeBytes: null,
    category: 'comment',
    status: 'pending',
    createdBy: 'patient',
    parentTaskId: null,
    readByDoctor: false,
    readByPatient: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

describe('CreateSharedFilePatientUseCase', () => {
  let useCase: CreateSharedFilePatientUseCase;
  let sharedFileRepo: jest.Mocked<ISharedFileRepository>;
  let portalRepo: jest.Mocked<IPatientPortalRepository>;

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

    portalRepo = {
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

    useCase = new CreateSharedFilePatientUseCase(sharedFileRepo, portalRepo);
  });

  it('creates shared file for patient with correct flags', async () => {
    portalRepo.findPatientsByAuthUserId.mockResolvedValue([makePatient()]);
    const savedSF = makeSF();
    sharedFileRepo.save.mockResolvedValue(savedSF);

    const result = await useCase.execute({
      authUserId: 'auth-001',
      title: 'Response',
      category: 'comment',
    });

    expect(result).toBe(savedSF);
    const savedArg = sharedFileRepo.save.mock.calls[0]![0]!;
    expect(savedArg.createdBy).toBe('patient');
    expect(savedArg.readByDoctor).toBe(false);
    expect(savedArg.readByPatient).toBe(true);
    expect(savedArg.doctorId).toBe('doctor-001');
    expect(savedArg.patientId).toBe('patient-001');
  });

  it('throws SharedFileNotFoundError when no patient record found for authUserId', async () => {
    portalRepo.findPatientsByAuthUserId.mockResolvedValue([]);

    await expect(
      useCase.execute({ authUserId: 'auth-unknown', title: 'Test', category: 'comment' }),
    ).rejects.toThrow(SharedFileNotFoundError);

    expect(sharedFileRepo.save).not.toHaveBeenCalled();
  });

  it('uses first patient record as the primary relationship', async () => {
    const primary = makePatient();
    const secondary = Patient.create({
      id: 'patient-002',
      doctorId: 'doctor-002',
      authUserId: 'auth-001',
      fullName: 'Other',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    portalRepo.findPatientsByAuthUserId.mockResolvedValue([primary, secondary]);
    sharedFileRepo.save.mockResolvedValue(makeSF());

    await useCase.execute({ authUserId: 'auth-001', title: 'T', category: 'comment' });

    const savedArg = sharedFileRepo.save.mock.calls[0]![0]!;
    expect(savedArg.patientId).toBe('patient-001');
    expect(savedArg.doctorId).toBe('doctor-001');
  });
});
