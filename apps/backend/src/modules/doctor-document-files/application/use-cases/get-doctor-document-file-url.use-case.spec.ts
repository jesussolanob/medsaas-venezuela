import { GetDoctorDocumentFileUrlUseCase } from './get-doctor-document-file-url.use-case';
import type { IDoctorDocumentFileRepository } from '../../domain/repositories/doctor-document-file.repository';
import type { IStoragePort } from '../../../storage/application/ports/storage.port';
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

const mockStorage: jest.Mocked<IStoragePort> = {
  upload: jest.fn(),
  getSignedUrl: jest.fn(),
};

const makeFile = () =>
  DoctorDocumentFile.create({
    id: 'file-1',
    doctorId: 'doctor-1',
    name: 'Lab results',
    storagePath: 'document/doctor-1/ts-lab.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 2048,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });

describe('GetDoctorDocumentFileUrlUseCase', () => {
  let useCase: GetDoctorDocumentFileUrlUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new GetDoctorDocumentFileUrlUseCase(mockRepo, mockStorage);
  });

  it('returns a signed URL for the file storage path', async () => {
    mockRepo.findById.mockResolvedValue(makeFile());
    mockStorage.getSignedUrl.mockResolvedValue('https://storage.example.com/signed?token=xyz');

    const result = await useCase.execute({ id: 'file-1', doctorId: 'doctor-1' });

    expect(result.url).toBe('https://storage.example.com/signed?token=xyz');
    // 5-min TTL (300_000 ms)
    expect(mockStorage.getSignedUrl).toHaveBeenCalledWith('document/doctor-1/ts-lab.pdf', 300_000);
  });

  it('throws DoctorDocumentFileNotFoundError when file not found', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute({ id: 'file-1', doctorId: 'doctor-1' })).rejects.toBeInstanceOf(
      DoctorDocumentFileNotFoundError,
    );

    expect(mockStorage.getSignedUrl).not.toHaveBeenCalled();
  });

  it('scopes the lookup to the requesting doctor (anti-IDOR)', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute({ id: 'file-1', doctorId: 'evil-doctor' })).rejects.toBeInstanceOf(
      DoctorDocumentFileNotFoundError,
    );

    expect(mockRepo.findById).toHaveBeenCalledWith('file-1', 'evil-doctor');
  });
});
