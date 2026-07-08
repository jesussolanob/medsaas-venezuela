import { DeleteSharedFileDoctorUseCase } from './delete-shared-file-doctor.use-case';
import { SharedFileNotFoundError } from '../../../domain/errors/shared-file-not-found.error';
import { SharedFile } from '../../../domain/entities/shared-file.entity';
import type { ISharedFileRepository } from '../../../domain/repositories/shared-file.repository';

const makeSF = () =>
  SharedFile.create({
    id: 'sf-001',
    doctorId: 'doctor-001',
    patientId: 'patient-001',
    title: 'Test',
    description: null,
    filePath: null,
    fileType: null,
    fileSizeBytes: null,
    category: 'file',
    status: 'pending',
    createdBy: 'doctor',
    parentTaskId: null,
    readByDoctor: true,
    readByPatient: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

describe('DeleteSharedFileDoctorUseCase', () => {
  let useCase: DeleteSharedFileDoctorUseCase;
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

    useCase = new DeleteSharedFileDoctorUseCase(repo);
  });

  it('deletes successfully when record belongs to doctor', async () => {
    repo.findByIdAndDoctor.mockResolvedValue(makeSF());
    repo.delete.mockResolvedValue();

    await useCase.execute({ id: 'sf-001', doctorId: 'doctor-001' });

    expect(repo.delete).toHaveBeenCalledWith('sf-001');
  });

  it('throws SharedFileNotFoundError when not found or wrong doctor (anti-IDOR)', async () => {
    repo.findByIdAndDoctor.mockResolvedValue(null);

    await expect(useCase.execute({ id: 'sf-001', doctorId: 'doctor-999' })).rejects.toThrow(
      SharedFileNotFoundError,
    );

    expect(repo.delete).not.toHaveBeenCalled();
  });
});
