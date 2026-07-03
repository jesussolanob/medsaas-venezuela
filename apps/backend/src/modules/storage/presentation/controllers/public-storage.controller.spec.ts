import { Test, type TestingModule } from '@nestjs/testing';
import { PublicStorageController } from './public-storage.controller';
import { PublicUploadReceiptUseCase } from '../../application/use-cases/public-upload-receipt.use-case';
import { StorageValidationError, StorageUploadError } from '../../domain/errors/storage.error';

const mockUseCase: jest.Mocked<Pick<PublicUploadReceiptUseCase, 'execute'>> = {
  execute: jest.fn(),
};

/** Minimal Multer.File stub — avoids TS namespace issue in test context. */
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

const jpegFile: MulterFileLike = {
  fieldname: 'file',
  originalname: 'comprobante.jpg',
  encoding: '7bit',
  mimetype: 'image/jpeg',
  buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  size: 2048,
  destination: '',
  filename: '',
  path: '',
  stream: null,
};

describe('PublicStorageController', () => {
  let controller: PublicStorageController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicStorageController],
      providers: [{ provide: PublicUploadReceiptUseCase, useValue: mockUseCase }],
    }).compile();

    controller = module.get(PublicStorageController);
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // POST /storage/public-upload
  // -------------------------------------------------------------------------
  describe('POST /storage/public-upload', () => {
    it('returns success envelope with url and path on valid upload', async () => {
      mockUseCase.execute.mockResolvedValue({
        url: 'https://storage.example.com/receipts/public/123-comprobante.jpg',
        path: 'receipts/public/123-comprobante.jpg',
      });

      const result = await controller.publicUpload(jpegFile as unknown as Express.Multer.File);

      expect(result.success).toBe(true);
      expect(result.data.url).toContain('receipts/public/');
      expect(result.data.path).toContain('receipts/public/');
    });

    it('passes buffer, originalname, mimetype, and size to the use case', async () => {
      mockUseCase.execute.mockResolvedValue({ url: 'u', path: 'p' });

      await controller.publicUpload(jpegFile as unknown as Express.Multer.File);

      const call = mockUseCase.execute.mock.calls[0]![0]!;
      expect(call.buffer).toEqual(jpegFile.buffer);
      expect(call.originalname).toBe('comprobante.jpg');
      expect(call.mimetype).toBe('image/jpeg');
      expect(call.size).toBe(2048);
    });

    it('does NOT pass a userId — endpoint is unauthenticated', async () => {
      mockUseCase.execute.mockResolvedValue({ url: 'u', path: 'p' });

      await controller.publicUpload(jpegFile as unknown as Express.Multer.File);

      const call = mockUseCase.execute.mock.calls[0]![0]! as unknown as Record<string, unknown>;
      expect(call).not.toHaveProperty('userId');
    });

    it('does NOT pass a kind parameter — kind is hardcoded in the use case', async () => {
      mockUseCase.execute.mockResolvedValue({ url: 'u', path: 'p' });

      await controller.publicUpload(jpegFile as unknown as Express.Multer.File);

      const call = mockUseCase.execute.mock.calls[0]![0]! as unknown as Record<string, unknown>;
      expect(call).not.toHaveProperty('kind');
    });

    it('propagates StorageValidationError from the use case (invalid mime)', async () => {
      mockUseCase.execute.mockRejectedValue(
        new StorageValidationError('Content type "image/svg+xml" is not allowed'),
      );

      await expect(
        controller.publicUpload(jpegFile as unknown as Express.Multer.File),
      ).rejects.toThrow(StorageValidationError);
    });

    it('propagates StorageValidationError from the use case (file too large)', async () => {
      mockUseCase.execute.mockRejectedValue(
        new StorageValidationError('File exceeds maximum allowed size of 10 MB'),
      );

      await expect(
        controller.publicUpload(jpegFile as unknown as Express.Multer.File),
      ).rejects.toThrow(StorageValidationError);
    });

    it('propagates StorageValidationError from the use case (magic bytes mismatch)', async () => {
      mockUseCase.execute.mockRejectedValue(
        new StorageValidationError('File content does not match a supported receipt type'),
      );

      await expect(
        controller.publicUpload(jpegFile as unknown as Express.Multer.File),
      ).rejects.toThrow(StorageValidationError);
    });

    it('propagates StorageUploadError when the storage adapter fails', async () => {
      mockUseCase.execute.mockRejectedValue(new StorageUploadError('bucket connection refused'));

      await expect(
        controller.publicUpload(jpegFile as unknown as Express.Multer.File),
      ).rejects.toThrow(StorageUploadError);
    });
  });
});
