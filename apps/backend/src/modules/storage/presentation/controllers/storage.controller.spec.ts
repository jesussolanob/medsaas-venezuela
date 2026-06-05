import { Test, type TestingModule } from '@nestjs/testing';
import { StorageController } from './storage.controller';
import { UploadFileUseCase } from '../../application/use-cases/upload-file.use-case';
import { GetSignedUrlUseCase } from '../../application/use-cases/get-signed-url.use-case';
import { StorageValidationError, StorageUploadError } from '../../domain/errors/storage.error';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';

const mockUploadFileUseCase: jest.Mocked<Pick<UploadFileUseCase, 'execute'>> = {
  execute: jest.fn(),
};

const mockGetSignedUrlUseCase: jest.Mocked<Pick<GetSignedUrlUseCase, 'execute'>> = {
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
        { provide: GetSignedUrlUseCase, useValue: mockGetSignedUrlUseCase },
      ],
    }).compile();

    controller = module.get(StorageController);
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // POST /storage/upload
  // -------------------------------------------------------------------------
  describe('POST /storage/upload', () => {
    it('returns success response with url and path on valid upload (private kind)', async () => {
      mockUploadFileUseCase.execute.mockResolvedValue({
        url: 'https://minio/receipt/doctor-001/123-test.pdf?X-Amz-Signature=abc',
        path: 'receipt/doctor-001/123-test.pdf',
      });

      const result = await controller.upload(
        mockFile as unknown as Express.Multer.File,
        'receipt',
        mockUser,
      );

      expect(result.success).toBe(true);
      expect(result.data.url).toContain('X-Amz-Signature');
      expect(result.data.path).toBe('receipt/doctor-001/123-test.pdf');
    });

    it('returns success response with permanent public URL for public kind', async () => {
      mockUploadFileUseCase.execute.mockResolvedValue({
        url: 'http://localhost:9000/delta-uploads/avatar/doctor-001/123-avatar.png',
        path: 'avatar/doctor-001/123-avatar.png',
      });

      const result = await controller.upload(
        mockFile as unknown as Express.Multer.File,
        'avatar',
        mockUser,
      );

      expect(result.success).toBe(true);
      expect(result.data.url).not.toContain('Signature');
      expect(result.data.url).toContain('avatar');
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

  // -------------------------------------------------------------------------
  // GET /storage/signed-url (HIGH-2)
  // -------------------------------------------------------------------------
  describe('GET /storage/signed-url', () => {
    it('returns success response with signed URL and TTL', async () => {
      mockGetSignedUrlUseCase.execute.mockResolvedValue({
        url: 'https://minio/receipt/doctor-001/1-r.pdf?X-Amz-Signature=xyz',
        expiresInSeconds: 3600,
      });

      const result = await controller.signedUrl('receipt/doctor-001/1-r.pdf', mockUser);

      expect(result.success).toBe(true);
      expect(result.data.url).toContain('X-Amz-Signature');
      expect(result.data.expiresInSeconds).toBe(3600);
    });

    it('passes path and userId from authenticated user to use case', async () => {
      mockGetSignedUrlUseCase.execute.mockResolvedValue({
        url: 'https://minio/sig',
        expiresInSeconds: 3600,
      });

      await controller.signedUrl('document/doctor-001/doc.pdf', mockUser);

      const call = mockGetSignedUrlUseCase.execute.mock.calls[0]![0]!;
      expect(call.path).toBe('document/doctor-001/doc.pdf');
      expect(call.userId).toBe('doctor-001');
    });

    it('propagates StorageValidationError for IDOR attempt (wrong user path)', async () => {
      mockGetSignedUrlUseCase.execute.mockRejectedValue(
        new StorageValidationError('Access denied: path does not belong to the authenticated user'),
      );

      await expect(
        controller.signedUrl('receipt/doctor-999/secret.pdf', mockUser),
      ).rejects.toThrow(StorageValidationError);
    });

    it('propagates StorageValidationError for public kind path', async () => {
      mockGetSignedUrlUseCase.execute.mockRejectedValue(
        new StorageValidationError('Path "avatar/doctor-001/photo.png" does not belong to a private kind'),
      );

      await expect(
        controller.signedUrl('avatar/doctor-001/photo.png', mockUser),
      ).rejects.toThrow(StorageValidationError);
    });

    it('propagates StorageUploadError when storage adapter fails', async () => {
      mockGetSignedUrlUseCase.execute.mockRejectedValue(
        new StorageUploadError('presign timeout'),
      );

      await expect(
        controller.signedUrl('receipt/doctor-001/1-r.pdf', mockUser),
      ).rejects.toThrow(StorageUploadError);
    });
  });
});
