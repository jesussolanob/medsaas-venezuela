import { RenameDoctorDocumentFileUseCase } from './rename-doctor-document-file.use-case';
import type { IDoctorDocumentFileRepository } from '../../domain/repositories/doctor-document-file.repository';
import { DoctorDocumentFile } from '../../domain/entities/doctor-document-file.entity';
import { DoctorDocumentFileNotFoundError } from '../../domain/errors/doctor-document-file-not-found.error';

const mockRepo: jest.Mocked<IDoctorDocumentFileRepository> = {
  findAllByDoctor: jest.fn(),
  findById: jest.fn(),
  findByIdsAndDoctor: jest.fn(),
  countActiveByDoctor: jest.fn(),
  save: jest.fn(),
  rename: jest.fn(),
  softDelete: jest.fn(),
};

const makeFile = () =>
  DoctorDocumentFile.create({
    id: 'file-1',
    doctorId: 'doctor-1',
    name: 'Old name',
    storagePath: 'document/doctor-1/ts-file.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });

describe('RenameDoctorDocumentFileUseCase', () => {
  let useCase: RenameDoctorDocumentFileUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new RenameDoctorDocumentFileUseCase(mockRepo);
  });

  it('renames a file when found and owned by doctor', async () => {
    mockRepo.findById.mockResolvedValue(makeFile());
    mockRepo.rename.mockResolvedValue();

    await useCase.execute({ id: 'file-1', doctorId: 'doctor-1', name: 'New name' });

    expect(mockRepo.rename).toHaveBeenCalledWith('file-1', 'doctor-1', 'New name');
  });

  it('throws DoctorDocumentFileNotFoundError when file not found', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ id: 'file-1', doctorId: 'doctor-1', name: 'New name' }),
    ).rejects.toBeInstanceOf(DoctorDocumentFileNotFoundError);

    expect(mockRepo.rename).not.toHaveBeenCalled();
  });

  it('scopes the lookup to the requesting doctor (anti-IDOR)', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ id: 'file-1', doctorId: 'other-doctor', name: 'New name' }),
    ).rejects.toBeInstanceOf(DoctorDocumentFileNotFoundError);

    expect(mockRepo.findById).toHaveBeenCalledWith('file-1', 'other-doctor');
  });
});
