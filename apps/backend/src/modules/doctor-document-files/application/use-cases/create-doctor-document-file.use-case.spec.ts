import { CreateDoctorDocumentFileUseCase } from './create-doctor-document-file.use-case';
import type { IDoctorDocumentFileRepository } from '../../domain/repositories/doctor-document-file.repository';
import { DoctorDocumentFile } from '../../domain/entities/doctor-document-file.entity';
import { DoctorDocumentFileLimitExceededError } from '../../domain/errors/doctor-document-file-limit-exceeded.error';
import { DoctorDocumentFileInvalidPathError } from '../../domain/errors/doctor-document-file-invalid-path.error';

const mockRepo: jest.Mocked<IDoctorDocumentFileRepository> = {
  findAllByDoctor: jest.fn(),
  findById: jest.fn(),
  findByIdsAndDoctor: jest.fn(),
  countActiveByDoctor: jest.fn(),
  save: jest.fn(),
  rename: jest.fn(),
  softDelete: jest.fn(),
};

const DOCTOR_ID = 'doctor-abc';

const _makeFile = (overrides: Partial<ConstructorParameters<typeof DoctorDocumentFile>[0]> = {}) =>
  DoctorDocumentFile.create({
    id: 'file-1',
    doctorId: DOCTOR_ID,
    name: 'Hoja de tareas.pdf',
    storagePath: `document/${DOCTOR_ID}/ts-hoja.pdf`,
    mimeType: 'application/pdf',
    sizeBytes: 204800,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });

describe('CreateDoctorDocumentFileUseCase', () => {
  let useCase: CreateDoctorDocumentFileUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new CreateDoctorDocumentFileUseCase(mockRepo);
    mockRepo.countActiveByDoctor.mockResolvedValue(0);
    mockRepo.save.mockImplementation(async (f) => f);
  });

  it('creates a file successfully with a valid path', async () => {
    const result = await useCase.execute({
      doctorId: DOCTOR_ID,
      dto: {
        name: 'Ejercicios terapéuticos',
        filePath: `document/${DOCTOR_ID}/1700000000000-ejercicios.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 51200,
      },
    });

    expect(result.name).toBe('Ejercicios terapéuticos');
    expect(result.mimeType).toBe('application/pdf');
    expect(result.sizeBytes).toBe(51200);
    expect(mockRepo.save).toHaveBeenCalledTimes(1);

    const saved = mockRepo.save.mock.calls[0]![0] as DoctorDocumentFile;
    expect(saved.storagePath).toBe(`document/${DOCTOR_ID}/1700000000000-ejercicios.pdf`);
    expect(saved.deletedAt).toBeNull();
  });

  it('throws DoctorDocumentFileInvalidPathError when path lacks the required prefix', async () => {
    await expect(
      useCase.execute({
        doctorId: DOCTOR_ID,
        dto: {
          name: 'File',
          filePath: `document/other-doctor/ts-file.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: 100,
        },
      }),
    ).rejects.toBeInstanceOf(DoctorDocumentFileInvalidPathError);

    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('throws DoctorDocumentFileInvalidPathError for path traversal with ..', async () => {
    await expect(
      useCase.execute({
        doctorId: DOCTOR_ID,
        dto: {
          name: 'File',
          filePath: `document/${DOCTOR_ID}/../other/file.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: 100,
        },
      }),
    ).rejects.toBeInstanceOf(DoctorDocumentFileInvalidPathError);
  });

  it('throws DoctorDocumentFileInvalidPathError when path starts with a different kind', async () => {
    await expect(
      useCase.execute({
        doctorId: DOCTOR_ID,
        dto: {
          name: 'File',
          filePath: `avatar/${DOCTOR_ID}/photo.png`,
          mimeType: 'image/png',
          sizeBytes: 100,
        },
      }),
    ).rejects.toBeInstanceOf(DoctorDocumentFileInvalidPathError);
  });

  it('throws DoctorDocumentFileLimitExceededError when at the 50-file limit', async () => {
    mockRepo.countActiveByDoctor.mockResolvedValue(DoctorDocumentFile.MAX_FILES_PER_DOCTOR);

    await expect(
      useCase.execute({
        doctorId: DOCTOR_ID,
        dto: {
          name: 'Extra file',
          filePath: `document/${DOCTOR_ID}/ts-extra.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: 100,
        },
      }),
    ).rejects.toBeInstanceOf(DoctorDocumentFileLimitExceededError);

    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('checks path before checking the limit', async () => {
    // Invalid path should fail before we even count files
    mockRepo.countActiveByDoctor.mockResolvedValue(0);

    await expect(
      useCase.execute({
        doctorId: DOCTOR_ID,
        dto: {
          name: 'File',
          filePath: `document/evil-doctor/file.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: 100,
        },
      }),
    ).rejects.toBeInstanceOf(DoctorDocumentFileInvalidPathError);

    expect(mockRepo.countActiveByDoctor).not.toHaveBeenCalled();
  });

  it('assigns a UUID id and sets deletedAt to null', async () => {
    await useCase.execute({
      doctorId: DOCTOR_ID,
      dto: {
        name: 'File',
        filePath: `document/${DOCTOR_ID}/ts-file.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      },
    });

    const saved = mockRepo.save.mock.calls[0]![0] as DoctorDocumentFile;
    expect(saved.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(saved.deletedAt).toBeNull();
    expect(saved.doctorId).toBe(DOCTOR_ID);
  });
});
