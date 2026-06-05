import {
  UploadFileUseCase,
  sanitizeFilename,
  buildStoragePath,
  type UploadFileInput,
} from './upload-file.use-case';
import { StorageValidationError, StorageUploadError } from '../../domain/errors/storage.error';
import type { IStoragePort } from '../ports/storage.port';

const mockStorage: jest.Mocked<IStoragePort> = {
  upload: jest.fn(),
};

const makeUseCase = () => new UploadFileUseCase(mockStorage);

const validInput: UploadFileInput = {
  buffer: Buffer.from('data'),
  originalname: 'report.pdf',
  mimetype: 'application/pdf',
  size: 1024,
  kind: 'document',
  userId: 'user-123',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockStorage.upload.mockResolvedValue({
    url: 'http://localhost:9000/delta-uploads/document/user-123/1234-report.pdf',
    path: 'document/user-123/1234-report.pdf',
  });
});

describe('sanitizeFilename', () => {
  it('replaces spaces with underscores', () => {
    expect(sanitizeFilename('my file.pdf')).toBe('my_file.pdf');
  });

  it('removes path traversal characters', () => {
    // '/' is replaced with '_', '.' is kept (safe)
    expect(sanitizeFilename('../evil.pdf')).toBe('.._evil.pdf');
  });

  it('removes slash characters', () => {
    expect(sanitizeFilename('a/b/c.pdf')).toBe('a_b_c.pdf');
  });

  it('keeps safe characters intact', () => {
    expect(sanitizeFilename('valid-name_v2.png')).toBe('valid-name_v2.png');
  });
});

describe('buildStoragePath', () => {
  it('builds path with correct format', () => {
    const result = buildStoragePath('avatar', 'user-abc', 'photo.jpg');
    expect(result).toMatch(/^avatar\/user-abc\/\d+-photo\.jpg$/);
  });

  it('sanitizes the filename in the path', () => {
    const result = buildStoragePath('document', 'u1', 'bad file!.pdf');
    expect(result).not.toContain(' ');
    expect(result).not.toContain('!');
  });

  it('uses the provided kind as path prefix', () => {
    const result = buildStoragePath('logo', 'u1', 'logo.png');
    expect(result).toMatch(/^logo\//);
  });
});

describe('UploadFileUseCase', () => {
  describe('kind validation', () => {
    it.each(['avatar', 'receipt', 'document', 'logo', 'signature'])(
      'accepts valid kind "%s"',
      async (kind) => {
        const uc = makeUseCase();
        await expect(uc.execute({ ...validInput, kind })).resolves.toBeDefined();
      },
    );

    it('throws StorageValidationError for unknown kind', async () => {
      const uc = makeUseCase();
      await expect(uc.execute({ ...validInput, kind: 'video' })).rejects.toThrow(
        StorageValidationError,
      );
    });
  });

  describe('size validation', () => {
    it('accepts file at exactly 10 MB', async () => {
      const uc = makeUseCase();
      await expect(
        uc.execute({ ...validInput, size: 10 * 1024 * 1024 }),
      ).resolves.toBeDefined();
    });

    it('throws StorageValidationError for file exceeding 10 MB', async () => {
      const uc = makeUseCase();
      await expect(
        uc.execute({ ...validInput, size: 10 * 1024 * 1024 + 1 }),
      ).rejects.toThrow(StorageValidationError);
    });
  });

  describe('content-type validation', () => {
    it.each([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/svg+xml',
      'application/pdf',
    ])('accepts allowed MIME type "%s"', async (mimetype) => {
      const uc = makeUseCase();
      await expect(uc.execute({ ...validInput, mimetype })).resolves.toBeDefined();
    });

    it('throws StorageValidationError for disallowed MIME type', async () => {
      const uc = makeUseCase();
      await expect(
        uc.execute({ ...validInput, mimetype: 'application/exe' }),
      ).rejects.toThrow(StorageValidationError);
    });

    it('throws StorageValidationError for video MIME type', async () => {
      const uc = makeUseCase();
      await expect(
        uc.execute({ ...validInput, mimetype: 'video/mp4' }),
      ).rejects.toThrow(StorageValidationError);
    });
  });

  describe('successful upload', () => {
    it('calls storage.upload with correct path and contentType', async () => {
      const uc = makeUseCase();
      await uc.execute(validInput);

      expect(mockStorage.upload).toHaveBeenCalledTimes(1);
      const call = mockStorage.upload.mock.calls[0]![0]!;
      expect(call.contentType).toBe('application/pdf');
      expect(call.path).toMatch(/^document\/user-123\/\d+-report\.pdf$/);
      expect(call.buffer).toEqual(Buffer.from('data'));
    });

    it('returns url and path from storage adapter', async () => {
      const uc = makeUseCase();
      const result = await uc.execute(validInput);
      expect(result.url).toContain('delta-uploads');
      expect(result.path).toContain('document/user-123');
    });
  });

  describe('storage adapter failure', () => {
    it('throws StorageUploadError when adapter throws', async () => {
      mockStorage.upload.mockRejectedValue(new Error('connection refused'));
      const uc = makeUseCase();
      await expect(uc.execute(validInput)).rejects.toThrow(StorageUploadError);
    });

    it('wraps non-Error throws as StorageUploadError', async () => {
      mockStorage.upload.mockRejectedValue('string error');
      const uc = makeUseCase();
      await expect(uc.execute(validInput)).rejects.toThrow(StorageUploadError);
    });
  });
});
