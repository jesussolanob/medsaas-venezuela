import { DeleteDoctorDocumentFileUseCase } from './delete-doctor-document-file.use-case';
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
    name: 'File to delete',
    storagePath: 'document/doctor-1/ts-file.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });

describe('DeleteDoctorDocumentFileUseCase', () => {
  let useCase: DeleteDoctorDocumentFileUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new DeleteDoctorDocumentFileUseCase(mockRepo);
  });

  it('soft-deletes a file when found and owned by doctor', async () => {
    mockRepo.findById.mockResolvedValue(makeFile());
    mockRepo.softDelete.mockResolvedValue();

    await useCase.execute({ id: 'file-1', doctorId: 'doctor-1' });

    expect(mockRepo.softDelete).toHaveBeenCalledWith('file-1', 'doctor-1');
  });

  it('throws DoctorDocumentFileNotFoundError when file not found', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute({ id: 'file-1', doctorId: 'doctor-1' })).rejects.toBeInstanceOf(
      DoctorDocumentFileNotFoundError,
    );

    expect(mockRepo.softDelete).not.toHaveBeenCalled();
  });

  it('scopes the lookup to the requesting doctor (anti-IDOR)', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ id: 'file-1', doctorId: 'other-doctor' }),
    ).rejects.toBeInstanceOf(DoctorDocumentFileNotFoundError);

    expect(mockRepo.findById).toHaveBeenCalledWith('file-1', 'other-doctor');
  });
});
