import { UpdateSharedFileDoctorUseCase } from './update-shared-file-doctor.use-case';
import { SharedFileNotFoundError } from '../../../domain/errors/shared-file-not-found.error';
import { SharedFile } from '../../../domain/entities/shared-file.entity';
import type { ISharedFileRepository } from '../../../domain/repositories/shared-file.repository';

const makeSF = (overrides = {}) =>
  SharedFile.create({
    id: 'sf-001',
    doctorId: 'doctor-001',
    patientId: 'patient-001',
    title: 'Original',
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

describe('UpdateSharedFileDoctorUseCase', () => {
  let useCase: UpdateSharedFileDoctorUseCase;
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

    useCase = new UpdateSharedFileDoctorUseCase(repo);
  });

  it('updates successfully when record belongs to doctor', async () => {
    const existing = makeSF();
    const updated = makeSF({ title: 'Updated', status: 'completed' });
    repo.findByIdAndDoctor.mockResolvedValue(existing);
    repo.update.mockResolvedValue(updated);

    const result = await useCase.execute({
      id: 'sf-001',
      doctorId: 'doctor-001',
      title: 'Updated',
      status: 'completed',
    });

    expect(result).toBe(updated);
    expect(repo.findByIdAndDoctor).toHaveBeenCalledWith('sf-001', 'doctor-001');
    expect(repo.update).toHaveBeenCalledWith('sf-001', {
      title: 'Updated',
      description: undefined,
      status: 'completed',
    });
  });

  it('throws SharedFileNotFoundError when not found or wrong doctor', async () => {
    repo.findByIdAndDoctor.mockResolvedValue(null);

    await expect(
      useCase.execute({ id: 'sf-999', doctorId: 'doctor-001', title: 'X' }),
    ).rejects.toThrow(SharedFileNotFoundError);

    expect(repo.update).not.toHaveBeenCalled();
  });

  it('throws SharedFileNotFoundError when update returns null', async () => {
    repo.findByIdAndDoctor.mockResolvedValue(makeSF());
    repo.update.mockResolvedValue(null);

    await expect(
      useCase.execute({ id: 'sf-001', doctorId: 'doctor-001', title: 'X' }),
    ).rejects.toThrow(SharedFileNotFoundError);
  });
});
