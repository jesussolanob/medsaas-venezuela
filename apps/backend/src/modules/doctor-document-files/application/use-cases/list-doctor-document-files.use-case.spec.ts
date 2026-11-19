import { ListDoctorDocumentFilesUseCase } from './list-doctor-document-files.use-case';
import type { IDoctorDocumentFileRepository } from '../../domain/repositories/doctor-document-file.repository';
import { DoctorDocumentFile } from '../../domain/entities/doctor-document-file.entity';

const mockRepo: jest.Mocked<IDoctorDocumentFileRepository> = {
  findAllByDoctor: jest.fn(),
  findById: jest.fn(),
  findByIdsAndDoctor: jest.fn(),
  countActiveByDoctor: jest.fn(),
  save: jest.fn(),
  rename: jest.fn(),
  softDelete: jest.fn(),
};

const makeFile = (id: string, name: string) =>
  DoctorDocumentFile.create({
    id,
    doctorId: 'doctor-1',
    name,
    storagePath: `document/doctor-1/ts-${id}.pdf`,
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    createdAt: new Date('2026-11-19T10:00:00Z'),
    updatedAt: new Date('2026-11-19T10:00:00Z'),
    deletedAt: null,
  });

describe('ListDoctorDocumentFilesUseCase', () => {
  let useCase: ListDoctorDocumentFilesUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new ListDoctorDocumentFilesUseCase(mockRepo);
  });

  it('returns an empty array when the doctor has no files', async () => {
    mockRepo.findAllByDoctor.mockResolvedValue([]);
    const result = await useCase.execute('doctor-1');
    expect(result).toEqual([]);
  });

  it('returns mapped list items (no signed URLs)', async () => {
    mockRepo.findAllByDoctor.mockResolvedValue([
      makeFile('file-1', 'Hoja de tareas'),
      makeFile('file-2', 'Lab results'),
    ]);

    const result = await useCase.execute('doctor-1');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 'file-1',
      name: 'Hoja de tareas',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      createdAt: '2026-11-19T10:00:00.000Z',
    });
  });

  it('scopes the query to the requesting doctor', async () => {
    mockRepo.findAllByDoctor.mockResolvedValue([]);
    await useCase.execute('doctor-xyz');
    expect(mockRepo.findAllByDoctor).toHaveBeenCalledWith('doctor-xyz');
  });
});
