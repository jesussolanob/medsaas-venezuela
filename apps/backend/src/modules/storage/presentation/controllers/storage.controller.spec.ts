import { Test, type TestingModule } from '@nestjs/testing';
import { StorageController } from './storage.controller';
import { UploadFileUseCase } from '../../application/use-cases/upload-file.use-case';
import { StorageValidationError, StorageUploadError } from '../../domain/errors/storage.error';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';

const mockUploadFileUseCase: jest.Mocked<Pick<UploadFileUseCase, 'execute'>> = {
  execute: jest.fn(),
};

const mockUser: CurrentUserPayload = {
  sub: 'doctor-001',
  role: 'doctor',
  email: 'doctor@dev.local',
};

/** Minimal Multer.File object for testing — avoids TS Namespace issue in specs. */
interface MulterFileLike {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
  destination: string;
  filename: string;
  path: string;
  stream: null;
}

const mockFile: MulterFileLike = {
  fieldname: 'file',
  originalname: 'test.pdf',
  encoding: '7bit',
  mimetype: 'application/pdf',
  buffer: Buffer.from('pdf content'),
  size: 1024,
  destination: '',
  filename: '',
  path: '',
  stream: null,
};

describe('StorageController', () => {
  let controller: StorageController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StorageController],
      providers: [
        { provide: UploadFileUseCase, useValue: mockUploadFileUseCase },
      ],
    }).compile();

    controller = module.get(StorageController);
    jest.clearAllMocks();
  });

  describe('POST /storage/upload', () => {
    it('returns success response with url and path on valid upload', async () => {
      mockUploadFileUseCase.execute.mockResolvedValue({
        url: 'http://localhost:9000/delta-uploads/document/doctor-001/123-test.pdf',
        path: 'document/doctor-001/123-test.pdf',
      });

      const result = await controller.upload(
        mockFile as unknown as Express.Multer.File,
        'document',
        mockUser,
      );

      expect(result.success).toBe(true);
      expect(result.data.url).toContain('document/doctor-001');
      expect(result.data.path).toBe('document/doctor-001/123-test.pdf');
    });

    it('passes the userId from the authenticated user (never from body)', async () => {
      mockUploadFileUseCase.execute.mockResolvedValue({
        url: 'http://minio/x',
        path: 'x',
      });

      await controller.upload(mockFile as unknown as Express.Multer.File, 'avatar', mockUser);

      const call = mockUploadFileUseCase.execute.mock.calls[0]![0]!;
      expect(call.userId).toBe('doctor-001');
    });

    it('passes file buffer, originalname, mimetype, size, and kind to use case', async () => {
      mockUploadFileUseCase.execute.mockResolvedValue({ url: 'u', path: 'p' });

      await controller.upload(mockFile as unknown as Express.Multer.File, 'receipt', mockUser);

      const call = mockUploadFileUseCase.execute.mock.calls[0]![0]!;
      expect(call.buffer).toEqual(Buffer.from('pdf content'));
      expect(call.originalname).toBe('test.pdf');
      expect(call.mimetype).toBe('application/pdf');
      expect(call.size).toBe(1024);
      expect(call.kind).toBe('receipt');
    });

    it('propagates StorageValidationError from use case', async () => {
      mockUploadFileUseCase.execute.mockRejectedValue(
        new StorageValidationError('Invalid kind'),
      );

      await expect(
        controller.upload(mockFile as unknown as Express.Multer.File, 'bad-kind', mockUser),
      ).rejects.toThrow(StorageValidationError);
    });

    it('propagates StorageUploadError from use case', async () => {
      mockUploadFileUseCase.execute.mockRejectedValue(
        new StorageUploadError('connection refused'),
      );

      await expect(
        controller.upload(mockFile as unknown as Express.Multer.File, 'document', mockUser),
      ).rejects.toThrow(StorageUploadError);
    });
  });
});
