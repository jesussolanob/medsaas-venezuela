import { Test, TestingModule } from '@nestjs/testing';
import { DoctorDocumentFilesController } from './doctor-document-files.controller';
import { ListDoctorDocumentFilesUseCase } from '../../application/use-cases/list-doctor-document-files.use-case';
import { CreateDoctorDocumentFileUseCase } from '../../application/use-cases/create-doctor-document-file.use-case';
import { RenameDoctorDocumentFileUseCase } from '../../application/use-cases/rename-doctor-document-file.use-case';
import { DeleteDoctorDocumentFileUseCase } from '../../application/use-cases/delete-doctor-document-file.use-case';
import { GetDoctorDocumentFileUrlUseCase } from '../../application/use-cases/get-doctor-document-file-url.use-case';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';

const mockUser: CurrentUserPayload = { sub: 'doctor-1', role: 'doctor', email: 'doc@test.com' };

const mockListFiles = { execute: jest.fn() };
const mockCreateFile = { execute: jest.fn() };
const mockRenameFile = { execute: jest.fn() };
const mockDeleteFile = { execute: jest.fn() };
const mockGetFileUrl = { execute: jest.fn() };

describe('DoctorDocumentFilesController', () => {
  let controller: DoctorDocumentFilesController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DoctorDocumentFilesController],
      providers: [
        { provide: ListDoctorDocumentFilesUseCase, useValue: mockListFiles },
        { provide: CreateDoctorDocumentFileUseCase, useValue: mockCreateFile },
        { provide: RenameDoctorDocumentFileUseCase, useValue: mockRenameFile },
        { provide: DeleteDoctorDocumentFileUseCase, useValue: mockDeleteFile },
        { provide: GetDoctorDocumentFileUrlUseCase, useValue: mockGetFileUrl },
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(DoctorDocumentFilesController);
  });

  describe('list()', () => {
    it('returns the library files from the use case', async () => {
      const files = [
        {
          id: 'f1',
          name: 'File 1',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          createdAt: '2026-11-19T00:00:00.000Z',
        },
      ];
      mockListFiles.execute.mockResolvedValue(files);

      const result = await controller.list(mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(files);
      expect(mockListFiles.execute).toHaveBeenCalledWith('doctor-1');
    });
  });

  describe('create()', () => {
    it('delegates to CreateDoctorDocumentFileUseCase with doctorId from auth', async () => {
      const item = {
        id: 'f1',
        name: 'Lab',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        createdAt: '2026-11-19T00:00:00.000Z',
      };
      mockCreateFile.execute.mockResolvedValue(item);

      const dto = {
        name: 'Lab',
        filePath: 'document/doctor-1/ts-lab.pdf',
        mimeType: 'application/pdf' as const,
        sizeBytes: 1024,
      };

      const result = await controller.create(dto, mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(item);
      expect(mockCreateFile.execute).toHaveBeenCalledWith({
        doctorId: 'doctor-1',
        dto,
      });
    });
  });

  describe('rename()', () => {
    it('delegates to RenameDoctorDocumentFileUseCase with doctorId from auth', async () => {
      mockRenameFile.execute.mockResolvedValue(undefined);

      const result = await controller.rename('file-uuid', { name: 'New name' }, mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
      expect(mockRenameFile.execute).toHaveBeenCalledWith({
        id: 'file-uuid',
        doctorId: 'doctor-1',
        name: 'New name',
      });
    });
  });

  describe('remove()', () => {
    it('delegates to DeleteDoctorDocumentFileUseCase with doctorId from auth', async () => {
      mockDeleteFile.execute.mockResolvedValue(undefined);

      const result = await controller.remove('file-uuid', mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
      expect(mockDeleteFile.execute).toHaveBeenCalledWith({
        id: 'file-uuid',
        doctorId: 'doctor-1',
      });
    });
  });

  describe('getUrl()', () => {
    it('returns the signed URL from the use case', async () => {
      mockGetFileUrl.execute.mockResolvedValue({ url: 'https://storage.example.com/signed' });

      const result = await controller.getUrl('file-uuid', mockUser);

      expect(result.success).toBe(true);
      expect(result.data.url).toBe('https://storage.example.com/signed');
      expect(mockGetFileUrl.execute).toHaveBeenCalledWith({
        id: 'file-uuid',
        doctorId: 'doctor-1',
      });
    });
  });
});
