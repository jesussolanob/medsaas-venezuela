import { ListSharedFilesPatientUseCase } from './list-shared-files-patient.use-case';
import { SharedFile } from '../../../domain/entities/shared-file.entity';
import type { ISharedFileRepository } from '../../../domain/repositories/shared-file.repository';
import type { IPatientPortalRepository } from '../../../../patient-portal/domain/repositories/patient-portal.repository';

const makeSF = (id: string) =>
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

describe('ListSharedFilesPatientUseCase', () => {
  let useCase: ListSharedFilesPatientUseCase;
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

    useCase = new ListSharedFilesPatientUseCase(sharedFileRepo, portalRepo);
  });

  it('returns list scoped to the first patient record', async () => {
    portalRepo.findPatientIdsByAuthUserId.mockResolvedValue(['patient-001', 'patient-002']);
    const items = [makeSF('sf-001'), makeSF('sf-002')];
    sharedFileRepo.listByPatient.mockResolvedValue(items);

    const result = await useCase.execute({ authUserId: 'auth-001' });

    expect(result).toBe(items);
    expect(sharedFileRepo.listByPatient).toHaveBeenCalledWith('patient-001');
  });

  it('returns empty array when no patient records exist', async () => {
    portalRepo.findPatientIdsByAuthUserId.mockResolvedValue([]);

    const result = await useCase.execute({ authUserId: 'auth-unknown' });

    expect(result).toEqual([]);
    expect(sharedFileRepo.listByPatient).not.toHaveBeenCalled();
  });
});
